# DB3 — Agreement Acceptance Specification (GAP-09, DB3 portion)

**Date:** 2026-07-15 · **Git HEAD:** `0563866`
**Baseline:** `DB2_TERMS_VERSION_DECISION.md` (Content-owned Agreement +
immutable versions; snapshot lưu ref + content hash).

## 1. Agreement Version lifecycle (final)

`DRAFT → PUBLISHED → SUPERSEDED | WITHDRAWN` (diagram #18). **EFFECTIVE là
derived**: PUBLISHED + trong effective window + chưa superseded/withdrawn.
Đúng một effective version per agreement (per policy type) tại một thời
điểm (DB4 uniqueness candidate). Publish freezes content + computes content
hash (SHA-256 direction per ADR-DB1-012; canonicalization detail của rich
text → DB4/package — deferred #20 DB2 handoff). Withdraw = admin, reason,
audited; supersede = tự động khi version mới publish với effective mới.

## 2. Acceptance guard (GRD-008 — locked)

Tại **design approval** (TR-LC08-04):

1. **Required set (locked):** khách phải accept **effective version** của
   các agreement types mà policy config chỉ định cho hành vi approval —
   baseline bắt buộc: điều khoản đặt hàng/thanh toán (payment policy) và
   chính sách đổi trả (return policy). Type set là policy config (CON-144)
   để business thêm/bớt không cần schema change; baseline trên là default.
2. **Evidence:** Approval Snapshot lưu, per accepted type:
   AgreementVersionId + **content hash tại thời điểm accept** + acceptance
   timestamp (+ step-up evidence ref chung của approval). Hash phải khớp
   hash của version — mismatch = `TERMS_NOT_ACCEPTED` (version bị đổi ngầm
   là không thể do immutability, nhưng guard vẫn kiểm để chống stale client).
3. **Language/version match:** MVP single-language (vi); version accepted
   phải là effective version hiện hành — accept bản cũ hơn effective → fail,
   client reload.
4. **Quotation acceptance** (TR-LC12-03) **không** yêu cầu terms acceptance
   riêng (một ceremony tại approval là đủ theo `06 §9` — approval snapshot là
   nơi duy nhất lưu terms evidence); nếu business sau này muốn terms tại
   acceptance, thêm type binding vào config — additive.

## 3. Invalid/withdrawn/changed terms (locked)

- **Approval against withdrawn/superseded version:** guard fail — client
  phải hiển thị effective version mới và khách accept lại.
- **Terms thay đổi giữa chừng (đã approve, chưa xong order):** approval
  evidence lịch sử **vẫn valid** (immutable snapshot); **không re-approval
  bắt buộc** trừ khi có **new approval event** (post-approval revision,
  ADR-DB3-003) — new approval luôn accept effective terms hiện hành.
  Material-change re-consent ngoài approval flow không thuộc MVP scope
  (không có product requirement); ghi nhận là future policy hook.
- Withdrawn version vẫn được **retain** (immutable, referenced by historical
  snapshots) — không bao giờ xóa khi còn reference (ADR-DB1-011).

## 4. Audit & retention

Publish/supersede/withdraw audited (actor, reason cho withdraw); acceptance
evidence nằm trong approval snapshot (commercial retention). Agreement
versions: commercial retention class.

## 5. Handoff

- **DB4:** per-type acceptance fields trong approval snapshot (version ref +
  hash + timestamp); one-effective-per-agreement uniqueness; hash format.
- **DB7:** published-version immutability; guard fixture (accept stale
  version fails).
- **DB8:** approve-vs-publish race (approval tx đọc effective set trong tx —
  first commit wins; approval sau publish mới thấy version mới).
