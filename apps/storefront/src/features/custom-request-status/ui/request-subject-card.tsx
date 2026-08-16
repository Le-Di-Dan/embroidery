import { CUSTOM_REQUEST_STATUS_COPY as COPY } from '../model/custom-request-status-copy';
import type { RequestStatusView } from '../model/request-status-projection';

/**
 * The frozen submission (`661:27` … `661:49` desktop, `661:376` mobile).
 *
 * ### What it draws, and what it deliberately cannot
 *
 * The rows come from the projection, which has already resolved the subject
 * union into label/value pairs — so this component renders a catalog subject
 * and a customer-owned one with the same markup and no branch, and neither
 * branch can reach an identifier because none survived the projection.
 *
 * The attachment tiles carry a **role label and nothing else**, which is
 * exactly what the approved frames draw: `661:39`–`661:47` are grey tiles
 * reading "Ảnh vật phẩm" and "Tham khảo", not images. That is not a placeholder
 * standing in for artwork — APP5 publishes no customer-facing binary delivery
 * for private request assets (`APP5-B06` is Admin-only and is not this
 * checkpoint), so a tile is the whole truthful rendering. No object key, no
 * bucket, no scanner state and no invented signed URL appears here or in the
 * data that reaches here.
 *
 * The card is a `dl`, because a label/value table is what it is; the tiles are
 * a list, because the count is the information.
 */
export function RequestSubjectCard({ view }: { view: RequestStatusView }) {
  return (
    <section className="request-status__card" aria-labelledby="request-subject-title">
      <h2 className="request-status__card-title" id="request-subject-title">
        {COPY.subject.title}
      </h2>
      <p className="request-status__card-lead">{COPY.subject.frozen}</p>
      <dl className="request-status__facts">
        {view.subjectRows.map((row) => (
          <div className="request-status__fact" key={row.label}>
            <dt className="request-status__fact-label">{row.label}</dt>
            <dd className="request-status__fact-value">{row.value}</dd>
          </div>
        ))}
        <div className="request-status__fact">
          <dt className="request-status__fact-label">{COPY.subject.rows.quantity}</dt>
          <dd className="request-status__fact-value">
            {view.quantityLines.map((line, index) => (
              // Two lines can be byte-identical only if the request repeated a
              // size, which the projection preserves rather than merges (§11),
              // so position is the only stable identity these have.
              <span className="request-status__quantity-line" key={`${line.text}-${index}`}>
                {line.text}
              </span>
            ))}
          </dd>
        </div>
      </dl>
      {view.assets.length > 0 && (
        <>
          <p className="request-status__card-lead">{COPY.subject.assetsTitle}</p>
          <ul className="request-status__thumbs">
            {view.assets.map((asset, index) => (
              // The index is part of the key because the tiles are deliberately
              // indistinguishable: the projection kept the role and dropped the
              // asset id, so two attachments of the same role are equal values.
              <li className="request-status__thumb" key={`${asset.label}-${index}`}>
                {asset.label}
              </li>
            ))}
          </ul>
          <p className="request-status__card-note">{COPY.subject.assetsNote}</p>
        </>
      )}
    </section>
  );
}
