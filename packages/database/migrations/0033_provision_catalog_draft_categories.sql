-- APP2-B02-G01 — provision the fixed APP2 catalog category taxonomy.
--
-- `products.category_id` is NOT NULL with a `restrict` FK and no default, so a
-- product draft cannot exist without a category row. APP2 ships no category
-- management API (the `APP2-B02` plan owns exactly five product operations), so
-- the four categories the Product Owner locked are reference data provisioned
-- here rather than data an operator can create.
--
-- Data only. No table, column, constraint, index, trigger or function changes,
-- so the canonical schema fingerprint is unchanged by design — the fingerprint
-- hashes the normalized catalog, never row contents.
--
-- The ids are fixed, hand-authored UUIDv7-shaped literals rather than generated
-- values: reference rows must be byte-identical on every machine and in every
-- restored backup, and a migration that generated them would make the same
-- logical category a different id per environment. The timestamp prefix is a
-- deliberate constant sentinel — determinism outranks the time ordering that
-- `newId()` provides for rows created at runtime.
--
-- Idempotent and non-destructive per slug:
--   absent                     -> insert the canonical row;
--   present and canonical      -> accept (re-runs and restores stay clean);
--   present but contradictory  -> fail loudly rather than overwrite operator
--                                 data, because silently rewriting a category
--                                 name or status would change what every
--                                 product filed under it means.
-- Nothing is ever deleted or renamed here.

DO $$
DECLARE
  canonical CONSTANT jsonb := jsonb_build_array(
    jsonb_build_object('id', '019a0000-0000-7000-8000-000000000001',
                       'slug', 'thu-bong', 'name', 'Thú bông', 'display_order', 10),
    jsonb_build_object('id', '019a0000-0000-7000-8000-000000000002',
                       'slug', 'khan',     'name', 'Khăn',     'display_order', 20),
    jsonb_build_object('id', '019a0000-0000-7000-8000-000000000003',
                       'slug', 'quan-ao',  'name', 'Quần áo',  'display_order', 30),
    jsonb_build_object('id', '019a0000-0000-7000-8000-000000000004',
                       'slug', 'khac',     'name', 'Khác',     'display_order', 90)
  );
  entry jsonb;
  existing categories%ROWTYPE;
BEGIN
  FOR entry IN SELECT * FROM jsonb_array_elements(canonical)
  LOOP
    SELECT * INTO existing FROM categories WHERE slug = entry->>'slug';

    IF NOT FOUND THEN
      INSERT INTO categories (id, name, slug, display_order, status, is_indexable)
      VALUES (
        (entry->>'id')::uuid,
        entry->>'name',
        entry->>'slug',
        (entry->>'display_order')::integer,
        'PUBLISHED',
        true
      );
      CONTINUE;
    END IF;

    -- Present already: accept only an exact canonical match. `id` is compared
    -- too, because a different id under the same slug means product rows point
    -- somewhere this migration did not create.
    IF existing.id <> (entry->>'id')::uuid
       OR existing.name <> entry->>'name'
       OR existing.display_order <> (entry->>'display_order')::integer
       OR existing.status <> 'PUBLISHED'
       OR existing.is_indexable <> true
       OR existing.archived_at IS NOT NULL
    THEN
      RAISE EXCEPTION
        'APP2-B02-G01: category slug "%" already exists with conflicting semantics (id=%, name=%, status=%, display_order=%, is_indexable=%, archived_at=%); reconcile it manually before applying this migration',
        entry->>'slug', existing.id, existing.name, existing.status,
        existing.display_order, existing.is_indexable, existing.archived_at;
    END IF;
  END LOOP;
END
$$;
