import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.ext.asyncio import AsyncSession

from viewport.auth_utils import get_current_user
from viewport.background_tasks import delete_gallery_data_task
from viewport.dependencies import get_s3_client as get_async_s3_client
from viewport.models.db import get_db
from viewport.models.gallery import ProjectVisibility as GalleryProjectVisibility
from viewport.models.project import Project
from viewport.models.user import User
from viewport.repositories.gallery_repository import GalleryRepository
from viewport.repositories.project_repository import ProjectRepository
from viewport.s3_service import AsyncS3Client
from viewport.schemas.gallery import GalleryCreateRequest
from viewport.schemas.project import (
    ProjectCreateRequest,
    ProjectDetailResponse,
    ProjectGalleryReorderRequest,
    ProjectGallerySummaryResponse,
    ProjectListQueryParams,
    ProjectListResponse,
    ProjectResponse,
    ProjectUpdateRequest,
)

router = APIRouter(prefix="/projects", tags=["projects"])


def get_project_repository(db: AsyncSession = Depends(get_db)) -> ProjectRepository:
    return ProjectRepository(db)


def get_gallery_repository(db: AsyncSession = Depends(get_db)) -> GalleryRepository:
    return GalleryRepository(db)


def _serialize_project_response(
    project: Project,
    *,
    gallery_count: int,
    visible_gallery_count: int,
    entry_gallery_id: uuid.UUID | None,
    entry_gallery_name: str | None,
    total_photo_count: int,
    total_size_bytes: int,
    has_active_share_links: bool,
    cover_photo_thumbnail_url: str | None,
) -> ProjectResponse:
    return ProjectResponse(
        id=str(project.id),
        owner_id=str(project.owner_id),
        name=project.name,
        created_at=project.created_at,
        shooting_date=project.shooting_date,
        gallery_count=gallery_count,
        visible_gallery_count=visible_gallery_count,
        entry_gallery_id=str(entry_gallery_id) if entry_gallery_id else None,
        entry_gallery_name=entry_gallery_name,
        has_entry_gallery=entry_gallery_id is not None,
        total_photo_count=total_photo_count,
        total_size_bytes=total_size_bytes,
        has_active_share_links=has_active_share_links,
        cover_photo_thumbnail_url=cover_photo_thumbnail_url,
    )


async def _build_project_response(
    project: Project,
    repo: ProjectRepository,
    s3_client: AsyncS3Client,
) -> ProjectResponse:
    gallery_count = await repo.get_project_folder_count(project.id, listed_only=False)
    visible_gallery_count = await repo.get_project_folder_count(project.id, listed_only=True)
    entry_gallery = await repo.get_project_entry_gallery(project.id, owner_id=project.owner_id, listed_only=False)
    total_photo_count = await repo.get_project_total_photo_count(project.id, listed_only=False)
    total_size_bytes = await repo.get_project_total_size(project.id, listed_only=False)
    has_active_share_links = await repo.has_active_share_links(project.id)
    recent_keys = await repo.get_recent_project_thumbnail_keys(project.id, listed_only=False, limit=1)
    recent_url_map = await s3_client.generate_presigned_urls_batch(recent_keys, expires_in=7200) if recent_keys else {}

    return _serialize_project_response(
        project,
        gallery_count=gallery_count,
        visible_gallery_count=visible_gallery_count,
        entry_gallery_id=entry_gallery.id if entry_gallery else None,
        entry_gallery_name=entry_gallery.name if entry_gallery else None,
        total_photo_count=total_photo_count,
        total_size_bytes=total_size_bytes,
        has_active_share_links=has_active_share_links,
        cover_photo_thumbnail_url=recent_url_map.get(recent_keys[0]) if recent_keys else None,
    )


async def _build_project_responses(
    projects: list[Project],
    repo: ProjectRepository,
    gallery_repo: GalleryRepository,
    s3_client: AsyncS3Client,
) -> list[ProjectResponse]:
    if not projects:
        return []

    project_ids = [project.id for project in projects]
    project_galleries = await repo.get_project_folders_for_projects(project_ids)
    active_share_project_ids = await repo.get_active_share_project_ids(project_ids)
    recent_thumbnail_keys_by_project = await repo.get_recent_project_thumbnail_keys_by_project_ids(project_ids, limit=1)

    galleries_by_project: dict[uuid.UUID, list] = {}
    gallery_ids: list[uuid.UUID] = []
    cover_photo_ids: list[uuid.UUID] = []
    for gallery in project_galleries:
        if gallery.project_id is None:
            continue
        galleries_by_project.setdefault(gallery.project_id, []).append(gallery)
        gallery_ids.append(gallery.id)
        if gallery.cover_photo_id:
            cover_photo_ids.append(gallery.cover_photo_id)

    photo_count_by_gallery, total_size_by_gallery, _, _, _ = await gallery_repo.get_gallery_list_enrichment(
        gallery_ids,
        cover_photo_ids,
        recent_limit=0,
    )

    all_recent_keys = list(dict.fromkeys(key for recent_keys in recent_thumbnail_keys_by_project.values() for key in recent_keys))
    recent_url_map = await s3_client.generate_presigned_urls_batch(all_recent_keys, expires_in=7200) if all_recent_keys else {}

    responses: list[ProjectResponse] = []
    for project in projects:
        galleries = galleries_by_project.get(project.id, [])
        gallery_count = len(galleries)
        listed_galleries = [gallery for gallery in galleries if getattr(gallery, "project_visibility", "listed") == "listed"]
        total_photo_count = sum(photo_count_by_gallery.get(gallery.id, 0) for gallery in galleries)
        total_size_bytes = sum(total_size_by_gallery.get(gallery.id, 0) for gallery in galleries)
        entry_gallery = galleries[0] if galleries else None
        recent_keys = recent_thumbnail_keys_by_project.get(project.id, [])

        responses.append(
            _serialize_project_response(
                project,
                gallery_count=gallery_count,
                visible_gallery_count=len(listed_galleries),
                entry_gallery_id=entry_gallery.id if entry_gallery else None,
                entry_gallery_name=entry_gallery.name if entry_gallery else None,
                total_photo_count=total_photo_count,
                total_size_bytes=total_size_bytes,
                has_active_share_links=project.id in active_share_project_ids,
                cover_photo_thumbnail_url=recent_url_map.get(recent_keys[0]) if recent_keys else None,
            )
        )

    return responses


async def _build_project_folder_responses(
    galleries: list,
    gallery_repo: GalleryRepository,
    s3_client: AsyncS3Client,
    *,
    project_name: str,
) -> list[ProjectGallerySummaryResponse]:
    if not galleries:
        return []

    gallery_ids = [gallery.id for gallery in galleries]
    cover_photo_ids = [gallery.cover_photo_id for gallery in galleries if gallery.cover_photo_id]
    (
        photo_count_by_gallery,
        total_size_by_gallery,
        active_share_gallery_ids,
        cover_thumbnail_by_photo_id,
        recent_thumbnail_keys_by_gallery,
    ) = await gallery_repo.get_gallery_list_enrichment(gallery_ids, cover_photo_ids, recent_limit=1)

    all_thumbnail_keys: list[str] = []
    all_thumbnail_keys.extend(cover_thumbnail_by_photo_id.values())
    for keys in recent_thumbnail_keys_by_gallery.values():
        all_thumbnail_keys.extend(keys[:1])

    presigned_by_key = await s3_client.generate_presigned_urls_batch(list(dict.fromkeys(all_thumbnail_keys)), expires_in=7200) if all_thumbnail_keys else {}

    responses: list[ProjectGallerySummaryResponse] = []
    for gallery in galleries:
        cover_key = cover_thumbnail_by_photo_id.get(gallery.cover_photo_id) if gallery.cover_photo_id else None
        recent_keys = recent_thumbnail_keys_by_gallery.get(gallery.id, [])
        fallback_cover_key = recent_keys[0] if recent_keys else None
        cover_thumbnail_url = presigned_by_key.get(cover_key) if cover_key else presigned_by_key.get(fallback_cover_key) if fallback_cover_key else None
        responses.append(
            ProjectGallerySummaryResponse(
                id=str(gallery.id),
                owner_id=str(gallery.owner_id),
                project_id=str(gallery.project_id) if gallery.project_id else None,
                project_name=project_name,
                project_position=int(getattr(gallery, "project_position", 0) or 0),
                project_visibility=getattr(gallery, "project_visibility", "listed"),
                name=gallery.name,
                created_at=gallery.created_at,
                shooting_date=gallery.shooting_date,
                cover_photo_id=str(gallery.cover_photo_id) if gallery.cover_photo_id else None,
                photo_count=photo_count_by_gallery.get(gallery.id, 0),
                total_size_bytes=total_size_by_gallery.get(gallery.id, 0),
                has_active_share_links=gallery.id in active_share_gallery_ids,
                cover_photo_thumbnail_url=cover_thumbnail_url,
            )
        )
    return responses


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    request: ProjectCreateRequest,
    repo: ProjectRepository = Depends(get_project_repository),
    current_user: User = Depends(get_current_user),
    s3_client: AsyncS3Client = Depends(get_async_s3_client),
) -> ProjectResponse:
    project = await repo.create_project(
        current_user.id,
        request.name,
        request.shooting_date,
    )
    return await _build_project_response(project, repo, s3_client)


@router.get("", response_model=ProjectListResponse)
async def list_projects(
    repo: ProjectRepository = Depends(get_project_repository),
    gallery_repo: GalleryRepository = Depends(get_gallery_repository),
    current_user: User = Depends(get_current_user),
    s3_client: AsyncS3Client = Depends(get_async_s3_client),
    list_query: ProjectListQueryParams = Depends(),
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
) -> ProjectListResponse:
    projects, total = await repo.get_projects_by_owner(
        current_user.id,
        page=page,
        size=size,
        search=list_query.search,
        sort_by=list_query.sort_by,
        order=list_query.order,
    )
    responses = await _build_project_responses(projects, repo, gallery_repo, s3_client)
    return ProjectListResponse(projects=responses, total=total, page=page, size=size)


@router.get("/{project_id}", response_model=ProjectDetailResponse)
async def get_project_detail(
    project_id: uuid.UUID,
    repo: ProjectRepository = Depends(get_project_repository),
    gallery_repo: GalleryRepository = Depends(get_gallery_repository),
    current_user: User = Depends(get_current_user),
    s3_client: AsyncS3Client = Depends(get_async_s3_client),
) -> ProjectDetailResponse:
    project = await repo.get_project_by_id_and_owner(project_id, current_user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    base_response = await _build_project_response(project, repo, s3_client)
    folders = await repo.get_project_folders_by_owner(project_id, current_user.id)
    folder_responses = await _build_project_folder_responses(folders, gallery_repo, s3_client, project_name=project.name)
    return ProjectDetailResponse(**base_response.model_dump(), galleries=folder_responses)


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: uuid.UUID,
    request: ProjectUpdateRequest,
    repo: ProjectRepository = Depends(get_project_repository),
    current_user: User = Depends(get_current_user),
    s3_client: AsyncS3Client = Depends(get_async_s3_client),
) -> ProjectResponse:
    project = await repo.update_project(project_id, current_user.id, name=request.name, shooting_date=request.shooting_date)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return await _build_project_response(project, repo, s3_client)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: uuid.UUID,
    repo: ProjectRepository = Depends(get_project_repository),
    current_user: User = Depends(get_current_user),
) -> None:
    deleted_gallery_ids = await repo.delete_project(project_id, current_user.id)
    if deleted_gallery_ids is None:
        raise HTTPException(status_code=404, detail="Project not found")
    for gallery_id in deleted_gallery_ids:
        await run_in_threadpool(delete_gallery_data_task.delay, str(gallery_id))


@router.put("/{project_id}/folders/reorder", status_code=status.HTTP_204_NO_CONTENT)
@router.put("/{project_id}/galleries/reorder", status_code=status.HTTP_204_NO_CONTENT)
async def reorder_project_galleries(
    project_id: uuid.UUID,
    request: ProjectGalleryReorderRequest,
    project_repo: ProjectRepository = Depends(get_project_repository),
    gallery_repo: GalleryRepository = Depends(get_gallery_repository),
    current_user: User = Depends(get_current_user),
) -> None:
    project = await project_repo.get_project_by_id_and_owner(project_id, current_user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        ordered_gallery_ids = [uuid.UUID(gallery_id) for gallery_id in request.gallery_ids]
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Invalid gallery id") from exc

    try:
        await gallery_repo.reorder_project_galleries(project_id, current_user.id, ordered_gallery_ids)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{project_id}/folders", response_model=ProjectGallerySummaryResponse, status_code=status.HTTP_201_CREATED)
@router.post("/{project_id}/galleries", response_model=ProjectGallerySummaryResponse, status_code=status.HTTP_201_CREATED)
async def create_project_folder(
    project_id: uuid.UUID,
    request: GalleryCreateRequest,
    project_repo: ProjectRepository = Depends(get_project_repository),
    gallery_repo: GalleryRepository = Depends(get_gallery_repository),
    current_user: User = Depends(get_current_user),
    s3_client: AsyncS3Client = Depends(get_async_s3_client),
) -> ProjectGallerySummaryResponse:
    project = await project_repo.get_project_by_id_and_owner(project_id, current_user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    gallery = await gallery_repo.create_gallery(
        current_user.id,
        request.name,
        request.shooting_date,
        public_sort_by=request.public_sort_by,
        public_sort_order=request.public_sort_order,
        project_id=project.id,
        project_position=request.project_position,
        project_visibility=GalleryProjectVisibility(request.project_visibility.value),
    )
    folder_responses = await _build_project_folder_responses([gallery], gallery_repo, s3_client, project_name=project.name)
    return folder_responses[0]
