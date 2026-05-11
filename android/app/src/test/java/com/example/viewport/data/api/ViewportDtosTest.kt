package com.example.viewport.data.api

import com.google.gson.Gson
import com.google.gson.JsonParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ViewportDtosTest {
  private val gson = Gson()

  @Test
  fun projectCreateSerializesBackendFieldNames() {
    val json = JsonParser.parseString(gson.toJson(ProjectCreateRequest(name = "Wedding", shootingDate = "2026-05-10"))).asJsonObject

    assertEquals("Wedding", json["name"].asString)
    assertEquals("2026-05-10", json["shooting_date"].asString)
    assertFalse(json.has("shootingDate"))
  }

  @Test
  fun uploadConfirmSerializesNestedPhotoItems() {
    val json =
      JsonParser.parseString(
        gson.toJson(BatchConfirmUploadRequest(listOf(ConfirmPhotoUploadItem(photoId = "photo-1", success = true)))),
      ).asJsonObject
    val item = json["items"].asJsonArray[0].asJsonObject

    assertEquals("photo-1", item["photo_id"].asString)
    assertTrue(item["success"].asBoolean)
    assertFalse(item.has("photoId"))
  }

  @Test
  fun galleryUpdateSerializesVisibilityAndPublicSortSettings() {
    val json =
      JsonParser.parseString(
        gson.toJson(
          GalleryUpdateRequest(
            projectVisibility = "direct_only",
            publicSortBy = "uploaded_at",
            publicSortOrder = "desc",
          ),
        ),
      ).asJsonObject

    assertEquals("direct_only", json["project_visibility"].asString)
    assertEquals("uploaded_at", json["public_sort_by"].asString)
    assertEquals("desc", json["public_sort_order"].asString)
  }

  @Test
  fun shareLinkUpdateSerializesLifecycleAndPasswordFields() {
    val json =
      JsonParser.parseString(
        gson.toJson(
          ShareLinkUpdateRequest(
            label = "Preview",
            isActive = false,
            expiresAt = "2026-05-10T12:00:00Z",
            passwordClear = true,
          ),
        ),
      ).asJsonObject

    assertEquals("Preview", json["label"].asString)
    assertFalse(json["is_active"].asBoolean)
    assertEquals("2026-05-10T12:00:00Z", json["expires_at"].asString)
    assertTrue(json["password_clear"].asBoolean)
  }
}
