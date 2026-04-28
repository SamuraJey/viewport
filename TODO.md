Искать галереи с is_deleted = True и created_at старше N дней (или добавить поле deleted_at).
Для каждой такой галереи запускать delete_gallery_data_task_impl напрямую.
