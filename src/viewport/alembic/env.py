from logging.config import fileConfig

from alembic import context
from alembic.operations import ops
from sqlalchemy import engine_from_config, pool

from viewport.models.db import Base
# Ensure all model modules are imported so that Base.metadata is populated for autogenerate
try:
    # Importing the package will import individual model modules via models/__init__.py
    import importlib
    importlib.import_module('viewport.models')
except Exception:
    # If model import fails, we still set target_metadata; autogenerate will be incomplete
    pass

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
target_metadata = Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    def _is_spurious_photos_fk(operation: ops.MigrateOperation) -> bool:
        if isinstance(operation, ops.CreateForeignKeyOp):
            return (
                operation.constraint_name == "photos_gallery_id_fkey"
                and operation.source_table == "photos"
                and operation.referent_table == "galleries"
            )
        if isinstance(operation, ops.DropConstraintOp):
            return (
                operation.constraint_name == "photos_gallery_id_fkey"
                and operation.table_name == "photos"
                and operation.constraint_type == "foreignkey"
            )
        return False

    def _prune_spurious_fk_ops(container: ops.OpContainer) -> None:
        filtered_ops: list[ops.MigrateOperation] = []
        for operation in container.ops:
            if isinstance(operation, ops.OpContainer):
                _prune_spurious_fk_ops(operation)
                if operation.ops:
                    filtered_ops.append(operation)
                continue
            if _is_spurious_photos_fk(operation):
                continue
            filtered_ops.append(operation)
        container.ops = filtered_ops

    def process_revision_directives(revision_context, revision, directives):
        if not getattr(config.cmd_opts, "autogenerate", False):
            return
        if not directives:
            return

        script = directives[0]
        _prune_spurious_fk_ops(script.upgrade_ops)
        _prune_spurious_fk_ops(script.downgrade_ops)

        if not script.upgrade_ops.ops and not script.downgrade_ops.ops:
            directives[:] = []

    def include_object(object, name, type_, reflected, compare_to):
        """Filter autogenerate objects before diffing."""
        if type_ in {"foreign_key_constraint", "foreignkey"}:
            object_name = name or getattr(object, "name", None) or getattr(compare_to, "name", None)
            table_name = getattr(getattr(object, "table", None), "name", None) or getattr(getattr(compare_to, "table", None), "name", None)
            referent_table = None
            target = object if object is not None else compare_to
            if target is not None and hasattr(target, "elements") and target.elements:
                referent_table = getattr(getattr(target.elements[0], "column", None), "table", None)
                referent_table = getattr(referent_table, "name", None)

            if object_name == "photos_gallery_id_fkey" and table_name == "photos" and referent_table == "galleries":
                return False

        # If alembic tries to drop a table (object exists in DB but not in models), don't auto-drop
        if type_ == 'table' and compare_to is None and reflected:
            return False
        return True

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=include_object,
            process_revision_directives=process_revision_directives,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
