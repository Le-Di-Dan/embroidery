/**
 * The tablet inspector drawer's own copy (`APP3-S06`).
 *
 * `APP3-S05` named the 1024 drawer after the only thing in it — text. `APP3-S06`
 * puts a second inspector in the same drawer, which is what `APP3-D01-C1`
 * anticipated when it said layers would later share it, so the drawer's own
 * name has to stop being one of its sections' names. A trigger labelled "bảng
 * thuộc tính chữ" that opens a panel containing an image control is a label
 * making a promise the panel does not keep.
 *
 * The section headings inside it stay in their own capabilities' copy, so each
 * checkpoint still owns the words for the thing it built.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/studio.json`, under `inspector`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const inspectorMessage = messageView(VI_MESSAGES.studio, 'inspector');

export const STUDIO_INSPECTOR_COPY = {
  panelLabel: inspectorMessage.text('panelLabel'),
  drawerOpen: inspectorMessage.text('drawerOpen'),
  drawerClose: inspectorMessage.text('drawerClose'),
} as const;
