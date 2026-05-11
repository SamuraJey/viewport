@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.example.viewport.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.Crossfade
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.CloudDownload
import androidx.compose.material.icons.outlined.CloudUpload
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.Link
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.PhotoLibrary
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Save
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Badge
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ElevatedButton
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import coil.compose.SubcomposeAsyncImage
import coil.request.ImageRequest
import com.example.viewport.AppUiState
import com.example.viewport.OwnerScreen
import com.example.viewport.ViewportViewModel
import com.example.viewport.data.api.GalleryPhotoResponse
import com.example.viewport.data.api.ProjectGallerySummaryResponse
import com.example.viewport.data.api.ProjectResponse
import com.example.viewport.data.api.ShareLinkResponse
import java.util.Locale

private val ScreenPadding = PaddingValues(horizontal = 18.dp, vertical = 16.dp)
private val LargeShape = RoundedCornerShape(28.dp)
private val MediumShape = RoundedCornerShape(22.dp)

@Composable
fun ViewportRoot(state: AppUiState, viewModel: ViewportViewModel) {
  val snackbarHostState = remember { SnackbarHostState() }
  LaunchedEffect(state.message, state.error) {
    val text = state.error ?: state.message
    if (!text.isNullOrBlank()) {
      snackbarHostState.showSnackbar(text)
      viewModel.clearMessage()
    }
  }

  Crossfade(targetState = state.sessionChecked to state.isAuthenticated, label = "root-auth") { (sessionChecked, authenticated) ->
    when {
      !sessionChecked -> LoadingScreen("Checking session…")
      !authenticated -> AuthScreen(state, viewModel)
      else -> OwnerShell(state, viewModel, snackbarHostState)
    }
  }
}

@Composable
private fun LoadingScreen(text: String) {
  Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
      CircularProgressIndicator()
      Text(text, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
  }
}

@Composable
private fun AuthScreen(state: AppUiState, viewModel: ViewportViewModel) {
  var email by remember { mutableStateOf("") }
  var password by remember { mutableStateOf("") }
  var inviteCode by remember { mutableStateOf("") }
  var registerMode by remember { mutableStateOf(false) }

  Box(
    Modifier
      .fillMaxSize()
      .background(
        Brush.verticalGradient(
          listOf(
            MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.55f),
            MaterialTheme.colorScheme.background,
            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
          ),
        ),
      )
      .verticalScroll(rememberScrollState())
      .padding(24.dp),
    contentAlignment = Alignment.Center,
  ) {
    ElevatedCard(
      modifier = Modifier.widthIn(max = 520.dp).fillMaxWidth(),
      shape = LargeShape,
      colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.96f)),
      elevation = CardDefaults.elevatedCardElevation(defaultElevation = 10.dp),
    ) {
      Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
          Surface(shape = RoundedCornerShape(18.dp), color = MaterialTheme.colorScheme.primaryContainer, modifier = Modifier.size(58.dp)) {
            Box(contentAlignment = Alignment.Center) { Icon(Icons.Outlined.PhotoLibrary, contentDescription = null, tint = MaterialTheme.colorScheme.primary) }
          }
          Column {
            Text("Viewport", style = MaterialTheme.typography.headlineMedium)
            Text("Photographer workspace", color = MaterialTheme.colorScheme.onSurfaceVariant)
          }
        }

        Text(
          if (registerMode) "Create an invite-based account to manage client galleries." else "Sign in to manage projects, galleries, uploads and share links.",
          color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        OutlinedTextField(
          value = email,
          onValueChange = { email = it },
          label = { Text("Email") },
          leadingIcon = { Icon(Icons.Outlined.Person, contentDescription = null) },
          modifier = Modifier.fillMaxWidth(),
          singleLine = true,
          shape = MediumShape,
        )
        OutlinedTextField(
          value = password,
          onValueChange = { password = it },
          label = { Text("Password") },
          leadingIcon = { Icon(Icons.Outlined.Lock, contentDescription = null) },
          modifier = Modifier.fillMaxWidth(),
          singleLine = true,
          visualTransformation = PasswordVisualTransformation(),
          shape = MediumShape,
        )
        AnimatedVisibility(registerMode) {
          OutlinedTextField(
            value = inviteCode,
            onValueChange = { inviteCode = it },
            label = { Text("Invite code") },
            leadingIcon = { Icon(Icons.Outlined.Link, contentDescription = null) },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            shape = MediumShape,
          )
        }
        Button(
          onClick = { if (registerMode) viewModel.register(email, password, inviteCode) else viewModel.login(email, password) },
          enabled = !state.isLoading && email.isNotBlank() && password.length >= 8 && (!registerMode || inviteCode.isNotBlank()),
          modifier = Modifier.fillMaxWidth().height(54.dp),
          shape = MediumShape,
        ) { Text(if (registerMode) "Create account" else "Sign in") }
        TextButton(onClick = { registerMode = !registerMode }, modifier = Modifier.align(Alignment.CenterHorizontally)) {
          Text(if (registerMode) "I already have an account" else "I have an invite code")
        }
      }
    }
  }
}

@Composable
private fun OwnerShell(state: AppUiState, viewModel: ViewportViewModel, snackbarHostState: SnackbarHostState) {
  val canGoBack = state.screen.canNavigateBack
  val scrollBehavior = TopAppBarDefaults.pinnedScrollBehavior()

  BackHandler(enabled = canGoBack) { viewModel.navigateBack() }

  Scaffold(
    modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
    containerColor = MaterialTheme.colorScheme.background,
    snackbarHost = { SnackbarHost(snackbarHostState) },
    topBar = {
      CenterAlignedTopAppBar(
        title = {
          Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(state.screenTitle, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (state.screenSubtitle.isNotBlank()) {
              Text(state.screenSubtitle, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
          }
        },
        navigationIcon = {
          if (canGoBack) {
            IconButton(onClick = { viewModel.navigateBack() }) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back") }
          }
        },
        actions = {
          IconButton(onClick = viewModel::logout) { Icon(Icons.AutoMirrored.Outlined.Logout, contentDescription = "Logout") }
        },
        scrollBehavior = scrollBehavior,
      )
    },
    bottomBar = {
      NavigationBar(containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.98f)) {
        NavigationBarItem(
          selected = state.screen is OwnerScreen.Projects || state.screen is OwnerScreen.Project || state.screen is OwnerScreen.Gallery,
          onClick = viewModel::openProjects,
          label = { Text("Projects") },
          icon = { Icon(Icons.Outlined.PhotoLibrary, contentDescription = null) },
        )
        NavigationBarItem(
          selected = state.screen is OwnerScreen.ShareLinks,
          onClick = viewModel::openShareLinks,
          label = { Text("Links") },
          icon = { Icon(Icons.Outlined.Link, contentDescription = null) },
        )
        NavigationBarItem(
          selected = state.screen is OwnerScreen.Profile,
          onClick = viewModel::openProfile,
          label = { Text("Profile") },
          icon = { Icon(Icons.Outlined.Person, contentDescription = null) },
        )
      }
    },
  ) { padding ->
    Box(
      Modifier
        .fillMaxSize()
        .padding(padding)
        .swipeBack(enabled = canGoBack) { viewModel.navigateBack() },
    ) {
      Crossfade(targetState = state.screen, label = "owner-screen") { screen ->
        when (screen) {
          OwnerScreen.Projects -> ProjectsScreen(state, viewModel)
          is OwnerScreen.Project -> ProjectScreen(state, viewModel, screen.projectId)
          is OwnerScreen.Gallery -> GalleryScreen(state, viewModel, screen.galleryId, screen.projectId)
          OwnerScreen.ShareLinks -> OwnerShareLinksScreen(state, viewModel)
          OwnerScreen.Profile -> ProfileScreen(state, viewModel)
        }
      }
      if (state.isLoading) {
        LinearProgressIndicator(modifier = Modifier.fillMaxWidth().align(Alignment.TopCenter))
      }
    }
  }
}

@Composable
private fun ProjectsScreen(state: AppUiState, viewModel: ViewportViewModel) {
  var search by remember(state.projectSearch) { mutableStateOf(state.projectSearch) }
  var newName by remember { mutableStateOf("") }
  var newDate by remember { mutableStateOf("") }
  var sortBy by remember(state.projectSortBy) { mutableStateOf(state.projectSortBy) }
  var order by remember(state.projectOrder) { mutableStateOf(state.projectOrder) }

  LazyColumn(contentPadding = ScreenPadding, verticalArrangement = Arrangement.spacedBy(16.dp)) {
    item {
      HeroCard(
        eyebrow = "Studio command center",
        title = "Projects",
        body = "Create deliveries, organize galleries and keep every client link in one place.",
      ) {
        StatPill(Icons.Outlined.Folder, "${state.projects.size}", "loaded")
        StatPill(Icons.Outlined.CloudUpload, state.user?.let { formatBytes(it.storageUsed) } ?: "—", "used")
      }
    }

    item {
      SectionCard(title = "Find and sort", icon = Icons.Outlined.Search) {
        OutlinedTextField(
          value = search,
          onValueChange = { search = it },
          label = { Text("Search projects") },
          leadingIcon = { Icon(Icons.Outlined.Search, contentDescription = null) },
          modifier = Modifier.fillMaxWidth(),
          singleLine = true,
          shape = MediumShape,
        )
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
          sortOptions.forEach { option ->
            FilterChip(
              selected = sortBy == option.key,
              onClick = { sortBy = option.key; viewModel.loadProjects(search, sortBy, order) },
              label = { Text(option.label) },
            )
          }
          FilterChip(
            selected = true,
            onClick = { order = if (order == "asc") "desc" else "asc"; viewModel.loadProjects(search, sortBy, order) },
            label = { Text(if (order == "asc") "Oldest first" else "Newest first") },
          )
          FilledTonalButton(onClick = { viewModel.loadProjects(search, sortBy, order) }) { Text("Apply") }
        }
      }
    }

    item {
      SectionCard(title = "Create project", icon = Icons.Outlined.Add) {
        OutlinedTextField(newName, { newName = it }, label = { Text("Project name") }, modifier = Modifier.fillMaxWidth(), singleLine = true, shape = MediumShape)
        OutlinedTextField(newDate, { newDate = it }, label = { Text("Shooting date yyyy-mm-dd") }, leadingIcon = { Icon(Icons.Outlined.CalendarMonth, contentDescription = null) }, modifier = Modifier.fillMaxWidth(), singleLine = true, shape = MediumShape)
        Button(onClick = { viewModel.createProject(newName, newDate); newName = ""; newDate = "" }, enabled = newName.isNotBlank(), modifier = Modifier.fillMaxWidth(), shape = MediumShape) { Text("Create project") }
      }
    }

    if (state.projects.isEmpty()) {
      item { EmptyState(Icons.Outlined.Folder, "No projects yet", "Create a project to start uploading galleries.") }
    } else {
      items(state.projects, key = { it.id }) { project -> ProjectCard(project, viewModel) }
    }
  }
}

@Composable
private fun ProjectCard(project: ProjectResponse, viewModel: ViewportViewModel) {
  ElevatedCard(
    modifier = Modifier.fillMaxWidth().clickable { viewModel.openProject(project.id) },
    shape = LargeShape,
    elevation = CardDefaults.elevatedCardElevation(defaultElevation = 4.dp),
  ) {
    Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
      SmartImage(project.coverPhotoThumbnailUrl, project.name, modifier = Modifier.size(92.dp), fallbackIcon = Icons.Outlined.Folder)
      Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(project.name.ifBlank { "Untitled project" }, style = MaterialTheme.typography.titleLarge, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Text(project.shootingDate, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyLarge)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
          MetaChip("${project.galleryCount} galleries")
          MetaChip("${project.totalPhotoCount} photos")
          MetaChip(formatBytes(project.totalSizeBytes))
        }
      }
    }
  }
}

@Composable
private fun ProjectScreen(state: AppUiState, viewModel: ViewportViewModel, projectId: String) {
  val context = LocalContext.current
  val project = state.selectedProject
  var galleryName by remember { mutableStateOf("") }
  var directOnly by remember { mutableStateOf(false) }
  var editName by remember(project?.name) { mutableStateOf(project?.name.orEmpty()) }
  var linkLabel by remember { mutableStateOf("") }
  var linkPassword by remember { mutableStateOf("") }

  LazyColumn(contentPadding = ScreenPadding, verticalArrangement = Arrangement.spacedBy(16.dp)) {
    if (project == null) {
      item { LoadingScreen("Loading project…") }
    } else {
      item {
        ProjectHero(project.name, project.coverPhotoThumbnailUrl) {
          StatPill(Icons.Outlined.Folder, "${project.galleryCount}", "galleries")
          StatPill(Icons.Outlined.Image, "${project.totalPhotoCount}", "photos")
          StatPill(Icons.Outlined.CloudDownload, formatBytes(project.totalSizeBytes), "size")
        }
      }

      item {
        SectionCard(title = "Project actions", icon = Icons.Outlined.Edit) {
          OutlinedTextField(editName, { editName = it }, label = { Text("Project name") }, modifier = Modifier.fillMaxWidth(), singleLine = true, shape = MediumShape)
          FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Button(onClick = { viewModel.updateProject(projectId, editName, null) }, shape = MediumShape) { Icon(Icons.Outlined.Save, null); Spacer(Modifier.width(8.dp)); Text("Save") }
            FilledTonalButton(onClick = { viewModel.downloadProject(context, projectId) }, shape = MediumShape) { Icon(Icons.Outlined.Download, null); Spacer(Modifier.width(8.dp)); Text("ZIP") }
            OutlinedButton(onClick = { viewModel.deleteProject(projectId) }, colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error), shape = MediumShape) { Icon(Icons.Outlined.Delete, null); Spacer(Modifier.width(8.dp)); Text("Delete") }
          }
        }
      }

      item {
        SectionCard(title = "New gallery", icon = Icons.Outlined.Add) {
          OutlinedTextField(galleryName, { galleryName = it }, label = { Text("Gallery name") }, modifier = Modifier.fillMaxWidth(), singleLine = true, shape = MediumShape)
          Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Icon(if (directOnly) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Column(Modifier.weight(1f)) {
              Text(if (directOnly) "Direct-only gallery" else "Listed in project shares", fontWeight = FontWeight.SemiBold)
              Text(if (directOnly) "Hidden from project share navigation" else "Visible inside project share links", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelLarge)
            }
            Switch(checked = directOnly, onCheckedChange = { directOnly = it })
          }
          Button(onClick = { viewModel.createGallery(projectId, galleryName, if (directOnly) "direct_only" else "listed"); galleryName = "" }, enabled = galleryName.isNotBlank(), modifier = Modifier.fillMaxWidth(), shape = MediumShape) { Text("Create gallery") }
        }
      }

      item { SectionTitle("Galleries", "${project.galleries.size} folders") }
      if (project.galleries.isEmpty()) {
        item { EmptyState(Icons.Outlined.PhotoLibrary, "No galleries", "Create a gallery and add photos from your phone.") }
      } else {
        items(project.galleries, key = { it.id }) { gallery -> ProjectGalleryCard(projectId, gallery, viewModel) }
      }

      item { SectionTitle("Project share links", "Client delivery") }
      item { ShareLinkComposer(label = linkLabel, password = linkPassword, onLabel = { linkLabel = it }, onPassword = { linkPassword = it }, onCreate = { viewModel.createProjectShareLink(projectId, linkLabel, linkPassword); linkLabel = ""; linkPassword = "" }) }
      items(state.projectShareLinks, key = { it.id }) { link -> ShareLinkCard(link, onToggle = { viewModel.toggleProjectShareLink(projectId, link) }, onDelete = { viewModel.deleteProjectShareLink(projectId, link.id) }) }
    }
  }
}

@Composable
private fun ProjectGalleryCard(projectId: String, gallery: ProjectGallerySummaryResponse, viewModel: ViewportViewModel) {
  ElevatedCard(shape = LargeShape, modifier = Modifier.fillMaxWidth()) {
    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
      Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        SmartImage(gallery.coverPhotoThumbnailUrl, gallery.name, modifier = Modifier.size(82.dp), fallbackIcon = Icons.Outlined.PhotoLibrary)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
          Text(gallery.name, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
          FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            MetaChip("${gallery.photoCount} photos")
            MetaChip(formatBytes(gallery.totalSizeBytes))
            MetaChip(if (gallery.projectVisibility == "listed") "Listed" else "Direct-only")
          }
        }
      }
      FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Button(onClick = { viewModel.openGallery(gallery.id, projectId) }, shape = MediumShape) { Text("Open") }
        FilledTonalButton(onClick = { viewModel.updateGalleryVisibility(gallery.id, if (gallery.projectVisibility == "listed") "direct_only" else "listed") }, shape = MediumShape) { Text("Visibility") }
        OutlinedButton(onClick = { viewModel.deleteGallery(projectId, gallery.id) }, colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error), shape = MediumShape) { Text("Delete") }
      }
    }
  }
}

@Composable
private fun GalleryScreen(state: AppUiState, viewModel: ViewportViewModel, galleryId: String, projectId: String?) {
  val context = LocalContext.current
  val gallery = state.selectedGallery
  var search by remember { mutableStateOf("") }
  var preview by remember { mutableStateOf<GalleryPhotoResponse?>(null) }
  var renameTarget by remember { mutableStateOf<GalleryPhotoResponse?>(null) }
  var linkLabel by remember { mutableStateOf("") }
  var linkPassword by remember { mutableStateOf("") }
  val picker =
    rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(maxItems = 100)) { uris: List<Uri> ->
      if (uris.isNotEmpty()) viewModel.enqueueUpload(context, galleryId, uris)
    }
  val photos = gallery?.photos.orEmpty()

  LazyVerticalGrid(
    columns = GridCells.Adaptive(168.dp),
    contentPadding = ScreenPadding,
    horizontalArrangement = Arrangement.spacedBy(12.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    item(span = { GridItemSpan(maxLineSpan) }) {
      GalleryHero(
        title = gallery?.name ?: "Gallery",
        subtitle = "${gallery?.totalPhotos ?: 0} photos • ${formatBytes(gallery?.totalSizeBytes ?: 0)}",
        coverUrl = gallery?.coverPhotoThumbnailUrl,
        onUpload = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
        onDownload = { viewModel.downloadGallery(context, galleryId) },
      )
    }
    item(span = { GridItemSpan(maxLineSpan) }) {
      SectionCard(title = "Search photos", icon = Icons.Outlined.Search) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
          OutlinedTextField(search, { search = it }, label = { Text("Filename") }, modifier = Modifier.weight(1f), singleLine = true, shape = MediumShape)
          FilledTonalIconButton(onClick = { viewModel.openGallery(galleryId, projectId, search) }) { Icon(Icons.Outlined.Search, contentDescription = "Search") }
        }
      }
    }

    if (photos.isEmpty()) {
      item(span = { GridItemSpan(maxLineSpan) }) { EmptyState(Icons.Outlined.Image, "No photos here", "Tap Add photos to upload JPG or PNG files.") }
    } else {
      items(photos, key = { it.id }) { photo ->
        PhotoTile(
          galleryId = galleryId,
          photo = photo,
          viewModel = viewModel,
          onPreview = { preview = it },
          onRename = { renameTarget = it },
        )
      }
    }

    item(span = { GridItemSpan(maxLineSpan) }) { SectionTitle("Gallery share links", "Direct gallery access") }
    item(span = { GridItemSpan(maxLineSpan) }) { ShareLinkComposer(label = linkLabel, password = linkPassword, onLabel = { linkLabel = it }, onPassword = { linkPassword = it }, onCreate = { viewModel.createGalleryShareLink(galleryId, linkLabel, linkPassword); linkLabel = ""; linkPassword = "" }) }
    items(state.galleryShareLinks, key = { it.id }, span = { GridItemSpan(maxLineSpan) }) { link -> ShareLinkCard(link, onToggle = { viewModel.toggleGalleryShareLink(galleryId, link) }, onDelete = { viewModel.deleteGalleryShareLink(galleryId, link.id) }) }
  }

  preview?.let { photo -> PhotoPreviewDialog(photo = photo, onClose = { preview = null }) }
  renameTarget?.let { photo -> RenamePhotoDialog(photo = photo, galleryId = galleryId, viewModel = viewModel, onClose = { renameTarget = null }) }
}

@Composable
private fun PhotoTile(galleryId: String, photo: GalleryPhotoResponse, viewModel: ViewportViewModel, onPreview: (GalleryPhotoResponse) -> Unit, onRename: (GalleryPhotoResponse) -> Unit) {
  val context = LocalContext.current
  ElevatedCard(shape = MediumShape, modifier = Modifier.fillMaxWidth()) {
    Box {
      SmartImage(
        urls = listOf(photo.thumbnailUrl, photo.url),
        contentDescription = photo.filename,
        modifier = Modifier.fillMaxWidth().aspectRatio(1f).clickable { onPreview(photo) },
        fallbackIcon = Icons.Outlined.Image,
        errorText = "Cannot load image",
      )
      Surface(
        color = Color.Black.copy(alpha = 0.50f),
        contentColor = Color.White,
        modifier = Modifier.align(Alignment.BottomStart).fillMaxWidth(),
      ) {
        Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
          Text(photo.filename, maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.SemiBold)
          Text(formatBytes(photo.fileSize), style = MaterialTheme.typography.labelLarge, color = Color.White.copy(alpha = 0.82f))
        }
      }
    }
    FlowRow(Modifier.padding(8.dp), horizontalArrangement = Arrangement.SpaceEvenly, verticalArrangement = Arrangement.spacedBy(4.dp)) {
      FilledTonalIconButton(onClick = { onRename(photo) }) { Icon(Icons.Outlined.Edit, contentDescription = "Rename") }
      FilledTonalIconButton(onClick = { viewModel.setCover(galleryId, photo.id) }) { Icon(Icons.Outlined.Star, contentDescription = "Set cover") }
      FilledTonalIconButton(onClick = { viewModel.downloadPhoto(context, photo) }) { Icon(Icons.Outlined.Download, contentDescription = "Download") }
      FilledTonalIconButton(onClick = { viewModel.deletePhoto(galleryId, photo.id) }) { Icon(Icons.Outlined.Delete, contentDescription = "Delete", tint = MaterialTheme.colorScheme.error) }
    }
  }
}

@Composable
private fun OwnerShareLinksScreen(state: AppUiState, viewModel: ViewportViewModel) {
  LazyColumn(contentPadding = ScreenPadding, verticalArrangement = Arrangement.spacedBy(16.dp)) {
    item { HeroCard("Delivery links", "Share links", "Monitor and copy every client-facing URL from one place.") { StatPill(Icons.Outlined.Link, "${state.ownerShareLinks.size}", "links") } }
    item { FilledTonalButton(onClick = viewModel::loadOwnerShareLinks, shape = MediumShape) { Icon(Icons.Outlined.Refresh, null); Spacer(Modifier.width(8.dp)); Text("Refresh") } }
    if (state.ownerShareLinks.isEmpty()) {
      item { EmptyState(Icons.Outlined.Link, "No share links", "Create project or gallery links from their detail screens.") }
    } else {
      items(state.ownerShareLinks, key = { it.id }) { link -> ShareLinkCard(link) }
    }
  }
}

@Composable
private fun ProfileScreen(state: AppUiState, viewModel: ViewportViewModel) {
  var displayName by remember(state.user?.displayName) { mutableStateOf(state.user?.displayName.orEmpty()) }
  var currentPassword by remember { mutableStateOf("") }
  var newPassword by remember { mutableStateOf("") }
  val used = state.user?.storageUsed ?: 0
  val quota = state.user?.storageQuota ?: 0

  LazyColumn(contentPadding = ScreenPadding, verticalArrangement = Arrangement.spacedBy(16.dp)) {
    item { HeroCard("Account", "Profile", state.user?.email.orEmpty()) { StatPill(Icons.Outlined.CloudUpload, formatBytes(used), "used"); StatPill(Icons.Outlined.CloudDownload, formatBytes(quota), "quota") } }
    item {
      SectionCard(title = "Photographer identity", icon = Icons.Outlined.Person) {
        OutlinedTextField(displayName, { displayName = it }, label = { Text("Display name") }, modifier = Modifier.fillMaxWidth(), singleLine = true, shape = MediumShape)
        Button(onClick = { viewModel.updateProfile(displayName) }, modifier = Modifier.fillMaxWidth(), shape = MediumShape) { Text("Save profile") }
      }
    }
    item {
      SectionCard(title = "Password", icon = Icons.Outlined.Lock) {
        OutlinedTextField(currentPassword, { currentPassword = it }, label = { Text("Current password") }, modifier = Modifier.fillMaxWidth(), visualTransformation = PasswordVisualTransformation(), shape = MediumShape)
        OutlinedTextField(newPassword, { newPassword = it }, label = { Text("New password") }, modifier = Modifier.fillMaxWidth(), visualTransformation = PasswordVisualTransformation(), shape = MediumShape)
        Button(onClick = { viewModel.changePassword(currentPassword, newPassword); currentPassword = ""; newPassword = "" }, enabled = currentPassword.length >= 8 && newPassword.length >= 8, modifier = Modifier.fillMaxWidth(), shape = MediumShape) { Text("Change password") }
      }
    }
  }
}

@Composable
private fun ShareLinkComposer(label: String, password: String, onLabel: (String) -> Unit, onPassword: (String) -> Unit, onCreate: () -> Unit) {
  SectionCard(title = "Create share link", icon = Icons.Outlined.Link) {
    OutlinedTextField(label, onLabel, label = { Text("Label") }, modifier = Modifier.fillMaxWidth(), singleLine = true, shape = MediumShape)
    OutlinedTextField(password, onPassword, label = { Text("Password optional, 8-72 bytes") }, modifier = Modifier.fillMaxWidth(), singleLine = true, visualTransformation = PasswordVisualTransformation(), shape = MediumShape)
    Button(onClick = onCreate, modifier = Modifier.fillMaxWidth(), shape = MediumShape) { Text("Create link") }
  }
}

@Composable
private fun ShareLinkCard(link: ShareLinkResponse, onToggle: (() -> Unit)? = null, onDelete: (() -> Unit)? = null) {
  val context = LocalContext.current
  val publicUrl = "https://viewport.samuraj.su/share/${link.id}"
  ElevatedCard(shape = LargeShape, modifier = Modifier.fillMaxWidth()) {
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
      Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Surface(shape = CircleShape, color = MaterialTheme.colorScheme.primaryContainer, modifier = Modifier.size(46.dp)) {
          Box(contentAlignment = Alignment.Center) { Icon(Icons.Outlined.Link, contentDescription = null, tint = MaterialTheme.colorScheme.primary) }
        }
        Column(Modifier.weight(1f)) {
          Text(link.label ?: link.id, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
          Text((link.galleryName ?: link.projectName ?: link.scopeType).orEmpty(), color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Badge(containerColor = if (link.isActive) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant) { Text(if (link.isActive) "ON" else "OFF") }
      }
      FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        MetaChip(link.scopeType)
        MetaChip("${link.views} views")
        MetaChip("${link.zipDownloads} zips")
        if (link.hasPassword) MetaChip("password")
      }
      FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        FilledTonalButton(onClick = { context.copyToSystemClipboard(publicUrl) }, shape = MediumShape) { Icon(Icons.Outlined.ContentCopy, null); Spacer(Modifier.width(8.dp)); Text("Copy") }
        if (onToggle != null) OutlinedButton(onClick = onToggle, shape = MediumShape) { Text(if (link.isActive) "Deactivate" else "Activate") }
        if (onDelete != null) OutlinedButton(onClick = onDelete, colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error), shape = MediumShape) { Text("Delete") }
      }
    }
  }
}

@Composable
private fun SectionCard(title: String, icon: ImageVector, content: @Composable () -> Unit) {
  OutlinedCard(shape = LargeShape, modifier = Modifier.fillMaxWidth(), colors = CardDefaults.outlinedCardColors(containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.94f))) {
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
      Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
        Text(title, style = MaterialTheme.typography.titleMedium)
      }
      content()
    }
  }
}

@Composable
private fun HeroCard(eyebrow: String, title: String, body: String, stats: @Composable () -> Unit) {
  ElevatedCard(shape = LargeShape, modifier = Modifier.fillMaxWidth(), colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.72f))) {
    Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
      Text(eyebrow.uppercase(Locale.US), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
      Text(title, style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.onPrimaryContainer)
      if (body.isNotBlank()) Text(body, color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.76f))
      FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { stats() }
    }
  }
}

@Composable
private fun ProjectHero(title: String, coverUrl: String?, stats: @Composable () -> Unit) {
  BoxWithConstraints {
    ElevatedCard(shape = LargeShape, modifier = Modifier.fillMaxWidth()) {
      if (this@BoxWithConstraints.maxWidth < 420.dp) {
        Column {
          SmartImage(coverUrl, title, modifier = Modifier.fillMaxWidth().height(190.dp), fallbackIcon = Icons.Outlined.Folder)
          HeroContent(title, "Project delivery", stats)
        }
      } else {
        Row(Modifier.height(210.dp)) {
          SmartImage(coverUrl, title, modifier = Modifier.weight(0.42f).fillMaxHeight(), fallbackIcon = Icons.Outlined.Folder)
          HeroContent(title, "Project delivery", stats, modifier = Modifier.weight(0.58f))
        }
      }
    }
  }
}

@Composable
private fun GalleryHero(title: String, subtitle: String, coverUrl: String?, onUpload: () -> Unit, onDownload: () -> Unit) {
  ElevatedCard(shape = LargeShape, modifier = Modifier.fillMaxWidth()) {
    Column {
      SmartImage(coverUrl, title, modifier = Modifier.fillMaxWidth().height(210.dp), fallbackIcon = Icons.Outlined.PhotoLibrary)
      Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(title, style = MaterialTheme.typography.headlineMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
          Button(onClick = onUpload, shape = MediumShape) { Icon(Icons.Outlined.CloudUpload, null); Spacer(Modifier.width(8.dp)); Text("Add photos") }
          FilledTonalButton(onClick = onDownload, shape = MediumShape) { Icon(Icons.Outlined.Download, null); Spacer(Modifier.width(8.dp)); Text("Download all") }
        }
      }
    }
  }
}

@Composable
private fun HeroContent(title: String, subtitle: String, stats: @Composable () -> Unit, modifier: Modifier = Modifier) {
  Column(modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
    Text(subtitle.uppercase(Locale.US), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
    Text(title, style = MaterialTheme.typography.headlineMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { stats() }
  }
}

@Composable
private fun SectionTitle(title: String, subtitle: String) {
  Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
    Column(Modifier.weight(1f)) {
      Text(title, style = MaterialTheme.typography.titleLarge)
      if (subtitle.isNotBlank()) Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    HorizontalDivider(Modifier.weight(0.8f))
  }
}

@Composable
private fun StatPill(icon: ImageVector, value: String, label: String) {
  Surface(shape = RoundedCornerShape(18.dp), color = MaterialTheme.colorScheme.surface.copy(alpha = 0.62f)) {
    Row(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp), tint = MaterialTheme.colorScheme.primary)
      Column {
        Text(value, style = MaterialTheme.typography.titleMedium, maxLines = 1)
        Text(label, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
      }
    }
  }
}

@Composable
private fun MetaChip(text: String) {
  AssistChip(onClick = {}, label = { Text(text, maxLines = 1, overflow = TextOverflow.Ellipsis) })
}

@Composable
private fun EmptyState(icon: ImageVector, title: String, body: String) {
  OutlinedCard(shape = LargeShape, modifier = Modifier.fillMaxWidth()) {
    Column(Modifier.padding(28.dp).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
      Surface(shape = CircleShape, color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.size(68.dp)) {
        Box(contentAlignment = Alignment.Center) { Icon(icon, contentDescription = null, modifier = Modifier.size(34.dp), tint = MaterialTheme.colorScheme.primary) }
      }
      Text(title, style = MaterialTheme.typography.titleLarge)
      Text(body, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
  }
}

@Composable
private fun SmartImage(url: String?, contentDescription: String?, modifier: Modifier, fallbackIcon: ImageVector, contentScale: ContentScale = ContentScale.Crop, errorText: String = "Image unavailable") {
  SmartImage(
    urls = listOf(url),
    contentDescription = contentDescription,
    modifier = modifier,
    fallbackIcon = fallbackIcon,
    contentScale = contentScale,
    errorText = errorText,
  )
}

@Composable
private fun SmartImage(urls: List<String?>, contentDescription: String?, modifier: Modifier, fallbackIcon: ImageVector, contentScale: ContentScale = ContentScale.Crop, errorText: String = "Image unavailable") {
  val context = LocalContext.current
  val candidates = remember(urls) { urls.mapNotNull { it?.takeIf(String::isNotBlank) }.distinct() }
  var index by remember(candidates) { mutableStateOf(0) }
  val currentUrl = candidates.getOrNull(index)
  if (currentUrl == null) {
    Box(modifier.clip(MediumShape).background(MaterialTheme.colorScheme.surfaceVariant)) {
      ImageFallback(fallbackIcon, errorText)
    }
    return
  }
  SubcomposeAsyncImage(
    model = ImageRequest.Builder(context).data(currentUrl).crossfade(true).build(),
    contentDescription = contentDescription,
    modifier = modifier.clip(MediumShape).background(MaterialTheme.colorScheme.surfaceVariant),
    contentScale = contentScale,
    loading = { ImageFallback(fallbackIcon, "Loading…") },
    error = {
      if (index < candidates.lastIndex) {
        LaunchedEffect(currentUrl) { index += 1 }
        ImageFallback(fallbackIcon, "Loading full image…")
      } else {
        ImageFallback(fallbackIcon, imageErrorHint(currentUrl, errorText))
      }
    },
  )
}

@Composable
private fun ImageFallback(icon: ImageVector, text: String? = null) {
  Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(12.dp)) {
      Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.72f), modifier = Modifier.size(36.dp))
      if (!text.isNullOrBlank()) {
        Text(text, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelLarge, maxLines = 3, overflow = TextOverflow.Ellipsis)
      }
    }
  }
}

private fun imageErrorHint(url: String, fallback: String): String {
  val host = runCatching { Uri.parse(url).host.orEmpty() }.getOrDefault("")
  return when {
    host == "localhost" || host == "127.0.0.1" || host == "s3-service" -> "S3 URL is not reachable from phone"
    else -> fallback
  }
}

@Composable
private fun PhotoPreviewDialog(photo: GalleryPhotoResponse, onClose: () -> Unit) {
  Dialog(onDismissRequest = onClose) {
    ElevatedCard(shape = LargeShape) {
      Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(photo.filename, style = MaterialTheme.typography.titleLarge, maxLines = 2, overflow = TextOverflow.Ellipsis)
        SmartImage(photo.url, photo.filename, modifier = Modifier.fillMaxWidth().height(460.dp), fallbackIcon = Icons.Outlined.Image, contentScale = ContentScale.Fit)
        TextButton(onClick = onClose, modifier = Modifier.align(Alignment.End)) { Text("Close") }
      }
    }
  }
}

@Composable
private fun RenamePhotoDialog(photo: GalleryPhotoResponse, galleryId: String, viewModel: ViewportViewModel, onClose: () -> Unit) {
  var filename by remember(photo.id) { mutableStateOf(photo.filename) }
  AlertDialog(
    onDismissRequest = onClose,
    icon = { Icon(Icons.Outlined.Edit, contentDescription = null) },
    title = { Text("Rename photo") },
    text = { OutlinedTextField(filename, { filename = it }, label = { Text("Filename") }, singleLine = true, shape = MediumShape) },
    confirmButton = {
      Button(onClick = { viewModel.renamePhoto(galleryId, photo.id, filename); onClose() }, enabled = filename.isNotBlank()) { Text("Save") }
    },
    dismissButton = { TextButton(onClick = onClose) { Text("Cancel") } },
  )
}

private data class SortOption(val key: String, val label: String)

private val sortOptions =
  listOf(
    SortOption("created_at", "Created"),
    SortOption("shooting_date", "Date"),
    SortOption("name", "Name"),
    SortOption("photo_count", "Photos"),
    SortOption("total_size_bytes", "Size"),
  )

private val OwnerScreen.canNavigateBack: Boolean
  get() = this !is OwnerScreen.Projects

private val AppUiState.screenTitle: String
  get() =
    when (val screen = screen) {
      OwnerScreen.Projects -> "Viewport"
      OwnerScreen.ShareLinks -> "Share links"
      OwnerScreen.Profile -> "Profile"
      is OwnerScreen.Project -> selectedProject?.name ?: "Project"
      is OwnerScreen.Gallery -> selectedGallery?.name ?: "Gallery"
    }

private val AppUiState.screenSubtitle: String
  get() =
    when (screen) {
      OwnerScreen.Projects -> user?.email.orEmpty()
      OwnerScreen.ShareLinks -> "Owner-wide"
      OwnerScreen.Profile -> user?.email.orEmpty()
      is OwnerScreen.Project -> selectedProject?.let { "${it.galleryCount} galleries • ${it.totalPhotoCount} photos" }.orEmpty()
      is OwnerScreen.Gallery -> selectedGallery?.let { "${it.totalPhotos} photos" }.orEmpty()
    }

private fun Modifier.swipeBack(enabled: Boolean, onBack: () -> Unit): Modifier =
  if (!enabled) {
    this
  } else {
    pointerInput(onBack) {
      var totalDrag = 0f
      detectHorizontalDragGestures(
        onDragStart = { totalDrag = 0f },
        onHorizontalDrag = { _, dragAmount -> totalDrag += dragAmount },
        onDragEnd = { if (totalDrag > 160f) onBack() },
        onDragCancel = { totalDrag = 0f },
      )
    }
  }

private fun formatBytes(value: Long): String {
  val units = listOf("B", "KB", "MB", "GB", "TB")
  var size = value.toDouble()
  var unit = 0
  while (size >= 1024 && unit < units.lastIndex) {
    size /= 1024
    unit++
  }
  return if (unit == 0) "${value}B" else String.format(Locale.US, "%.1f %s", size, units[unit])
}

private fun Context.copyToSystemClipboard(text: String) {
  val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
  clipboard.setPrimaryClip(ClipData.newPlainText("Viewport share link", text))
}
