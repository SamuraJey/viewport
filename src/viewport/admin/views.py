"""Admin views for Viewport models."""

from sqladmin import ModelView

from viewport.models.gallery import Gallery, Photo
from viewport.models.sharelink import ShareLink
from viewport.models.user import User


class UserAdmin(ModelView, model=User):
    """Admin view for User model."""

    name = "User"
    name_plural = "Users"
    icon = "fa-solid fa-user"

    # List page configuration
    column_list = [User.id, User.email, User.display_name, User.is_admin, User.created_at]
    column_searchable_list = [User.email, User.display_name]
    column_sortable_list = [User.email, User.created_at]
    column_default_sort = [(User.created_at, True)]

    # Details page configuration
    column_details_list = [
        User.id,
        User.email,
        User.display_name,
        User.is_admin,
        User.created_at,
        User.galleries,
    ]

    # Form configuration - hide password hash, exclude created_at
    form_excluded_columns = [User.password_hash, User.created_at, User.galleries]

    # Permissions - disable creation (registration via API only)
    can_create = False
    can_edit = True
    can_delete = True
    can_view_details = True


class GalleryAdmin(ModelView, model=Gallery):
    """Admin view for Gallery model."""

    name = "Gallery"
    name_plural = "Galleries"
    icon = "fa-solid fa-images"

    # List page configuration
    column_list = [
        Gallery.id,
        Gallery.name,
        Gallery.owner_id,
        Gallery.shooting_date,
        Gallery.created_at,
    ]
    column_searchable_list = [Gallery.name]
    column_sortable_list = [Gallery.created_at, Gallery.shooting_date, Gallery.name]
    column_default_sort = [(Gallery.created_at, True)]

    # Details page configuration - include relationships
    column_details_list = [
        Gallery.id,
        Gallery.name,
        Gallery.owner,
        Gallery.shooting_date,
        Gallery.created_at,
        Gallery.cover_photo_id,
        Gallery.photos,
        Gallery.share_links,
    ]

    # Form configuration - exclude relationships from edit forms
    form_excluded_columns = [Gallery.created_at, Gallery.photos, Gallery.share_links, Gallery.cover_photo]

    # Permissions
    can_create = False  # Galleries created via API only
    can_edit = True
    can_delete = True
    can_view_details = True


class PhotoAdmin(ModelView, model=Photo):
    """Admin view for Photo model."""

    name = "Photo"
    name_plural = "Photos"
    icon = "fa-solid fa-image"

    # List page configuration
    column_list = [
        Photo.id,
        Photo.gallery_id,
        Photo.object_key,
        Photo.file_size,
        Photo.width,
        Photo.height,
        Photo.uploaded_at,
    ]
    column_searchable_list = [Photo.object_key]
    column_sortable_list = [Photo.uploaded_at, Photo.file_size]
    column_default_sort = [(Photo.uploaded_at, True)]

    # Details page configuration
    column_details_list = [
        Photo.id,
        Photo.gallery,
        Photo.object_key,
        Photo.thumbnail_object_key,
        Photo.file_size,
        Photo.width,
        Photo.height,
        Photo.uploaded_at,
    ]

    # Form configuration
    form_excluded_columns = [Photo.uploaded_at, Photo.gallery]

    # Permissions - read-only, photos managed via API
    can_create = False
    can_edit = False
    can_delete = True  # Allow cleanup
    can_view_details = True


class ShareLinkAdmin(ModelView, model=ShareLink):
    """Admin view for ShareLink model."""

    name = "Share Link"
    name_plural = "Share Links"
    icon = "fa-solid fa-share-nodes"

    # List page configuration
    column_list = [
        ShareLink.id,
        ShareLink.gallery_id,
        ShareLink.expires_at,
        ShareLink.views,
        ShareLink.zip_downloads,
        ShareLink.single_downloads,
        ShareLink.created_at,
    ]
    column_sortable_list = [ShareLink.created_at, ShareLink.expires_at, ShareLink.views]
    column_default_sort = [(ShareLink.created_at, True)]

    # Details page configuration
    column_details_list = [
        ShareLink.id,
        ShareLink.gallery,
        ShareLink.expires_at,
        ShareLink.views,
        ShareLink.zip_downloads,
        ShareLink.single_downloads,
        ShareLink.created_at,
    ]

    # Form configuration
    form_excluded_columns = [ShareLink.created_at, ShareLink.views, ShareLink.zip_downloads, ShareLink.single_downloads, ShareLink.gallery]

    # Permissions
    can_create = False  # Share links created via API only
    can_edit = True  # Allow editing expiration
    can_delete = True
    can_view_details = True
