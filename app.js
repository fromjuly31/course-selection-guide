.app-page {
  --page: #edf2ef;
  --surface: #ffffff;
  --surface-soft: #f5f8f6;
  --ink: #14262b;
  --muted: #6c7c80;
  --primary: #08745b;
  --primary-dark: #075442;
  --brand-bg: #ddf2ea;
  --accent: #f3a75b;
  --accent-ink: #3c2106;
  --line: #dce5e1;
  --nav-bg: #071d25;
  --nav-muted: #8b9b9f;
  min-height: 100dvh;
  color: var(--ink);
  background:
    radial-gradient(circle at 90% 5%, rgba(8, 116, 91, 0.08), transparent 28rem),
    var(--page);
}

.app-header {
  position: sticky;
  z-index: 25;
  top: 0;
  border-bottom: 1px solid rgba(114, 224, 189, 0.12);
  background: rgba(7, 23, 32, 0.95);
  backdrop-filter: blur(18px);
}

.app-header-inner {
  display: flex;
  width: min(calc(100% - 32px), 1120px);
  min-height: 68px;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin: 0 auto;
}

.app-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.app-brand-mark {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 1px solid rgba(114, 224, 189, 0.24);
  border-radius: 12px;
  color: #72e0bd;
  background: rgba(114, 224, 189, 0.09);
}

.app-brand-mark .icon {
  width: 18px;
  height: 18px;
}

.app-brand strong,
.app-brand small {
  display: block;
}

.app-brand strong {
  color: #f4f6f2;
  font-size: 13px;
  letter-spacing: -0.03em;
}

.app-brand small {
  margin-top: 1px;
  color: rgba(255, 255, 255, 0.44);
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.header-db-status {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  gap: 7px;
  padding: 0 11px;
  border: 1px solid rgba(255, 255, 255, 0.11);
  border-radius: 999px;
  color: rgba(255, 255, 255, 0.62);
  font-size: 9px;
  font-weight: 750;
}

.header-db-status i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #72e0bd;
  box-shadow: 0 0 0 4px rgba(114, 224, 189, 0.1);
}

.header-db-status strong {
  display: grid;
  min-width: 24px;
  height: 20px;
  place-items: center;
  padding: 0 6px;
  border-radius: 999px;
  color: #071d25;
  background: #72e0bd;
  font-size: 8px;
}

.app-main {
  width: min(calc(100% - 32px), 1120px);
  min-height: calc(100dvh - 68px);
  margin: 0 auto;
  padding: 36px 0 120px;
  outline: none;
}

.initial-loading {
  display: grid;
  min-height: 48vh;
  place-items: center;
  align-content: center;
  gap: 14px;
  color: var(--muted);
  font-size: 11px;
}

.initial-loading span {
  width: 34px;
  height: 34px;
  border: 3px solid #cfe0da;
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 700ms linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.notice-stack {
  display: grid;
  gap: 8px;
  margin-bottom: 18px;
}

.screen-notice,
.admin-notice {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  padding: 14px 15px;
  border: 1px solid #ecd9bf;
  border-radius: 15px;
  color: #715329;
  background: #fff8ed;
  font-size: 10px;
  line-height: 1.65;
}

.screen-notice .icon,
.admin-notice .icon {
  flex: 0 0 auto;
  width: 17px;
  height: 17px;
  margin-top: 1px;
}

.admin-notice {
  margin-bottom: 18px;
}

.admin-notice strong {
  color: #513916;
}

.admin-notice code {
  padding: 2px 5px;
  border-radius: 5px;
  background: rgba(113, 83, 41, 0.08);
  font-family: Consolas, monospace;
}

.data-page-head {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: end;
  gap: 24px;
  margin-bottom: 28px;
}

.page-eyebrow,
.section-kicker,
.dialog-kicker {
  margin: 0 0 9px;
  color: var(--primary);
  font-family: Consolas, monospace;
  font-size: 9px;
  font-weight: 850;
  letter-spacing: 0.12em;
}

.data-page-head h1 {
  margin: 0;
  font-size: clamp(34px, 6vw, 56px);
  font-weight: 820;
  letter-spacing: -0.065em;
  line-height: 1.08;
}

.data-page-head > div > p:last-child {
  max-width: 660px;
  margin: 13px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.7;
}

.page-count {
  min-width: 116px;
  padding: 13px 15px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.7);
  text-align: right;
}

.page-count strong,
.page-count span {
  display: block;
}

.page-count strong {
  color: var(--primary);
  font-family: Georgia, serif;
  font-size: 24px;
}

.page-count span {
  margin-top: 2px;
  color: var(--muted);
  font-size: 9px;
  font-weight: 700;
}

.toolbar {
  margin-bottom: 22px;
  padding: 15px;
  border: 1px solid var(--line);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 14px 30px rgba(20, 38, 43, 0.05);
}

.search-field,
.compact-search {
  position: relative;
  display: block;
}

.search-field .icon,
.compact-search .icon {
  position: absolute;
  top: 50%;
  left: 14px;
  width: 18px;
  height: 18px;
  color: #82908e;
  transform: translateY(-50%);
  pointer-events: none;
}

.search-field input,
.compact-search input,
.sheet-picker select {
  width: 100%;
  min-height: 48px;
  padding: 0 15px 0 43px;
  border: 1px solid var(--line);
  border-radius: 14px;
  outline: none;
  color: var(--ink);
  background: #f8faf9;
  font: inherit;
  font-size: 11px;
}

.search-field input:focus,
.compact-search input:focus,
.sheet-picker select:focus {
  border-color: rgba(8, 116, 91, 0.55);
  box-shadow: 0 0 0 3px rgba(8, 116, 91, 0.09);
}

.filter-chips {
  display: flex;
  gap: 7px;
  margin-top: 12px;
  padding-bottom: 2px;
  overflow-x: auto;
  scrollbar-width: thin;
}

.filter-chip {
  min-height: 36px;
  flex: 0 0 auto;
  padding: 0 13px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: #536469;
  background: white;
  font-size: 10px;
  font-weight: 750;
}

.filter-chip:hover {
  border-color: rgba(8, 116, 91, 0.45);
}

.filter-chip.is-active {
  border-color: var(--primary);
  color: white;
  background: var(--primary);
}

.results-head,
.admin-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 22px 0 13px;
}

.results-head h2,
.admin-section-head h2,
.admin-section-head h3 {
  margin: 0;
  font-size: 17px;
  letter-spacing: -0.04em;
}

.admin-section-head .section-kicker {
  margin-bottom: 5px;
}

.results-head > span,
.admin-section-head > span {
  color: var(--muted);
  font-size: 9px;
  text-align: right;
}

.record-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.record-card {
  display: flex;
  min-width: 0;
  min-height: 248px;
  flex-direction: column;
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: 20px;
  background: var(--surface);
  box-shadow: 0 10px 25px rgba(20, 38, 43, 0.045);
  transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}

.record-card:hover {
  border-color: rgba(8, 116, 91, 0.34);
  box-shadow: 0 16px 34px rgba(20, 38, 43, 0.09);
  transform: translateY(-2px);
}

.record-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.record-category,
.record-university,
.source-badge {
  display: inline-flex;
  min-height: 25px;
  align-items: center;
  padding: 0 8px;
  border-radius: 999px;
  color: #11664f;
  background: #e5f3ee;
  font-size: 8px;
  font-weight: 800;
}

.record-university {
  overflow: hidden;
  color: #77664d;
  background: #f2eee7;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.record-card h2 {
  margin: 18px 0 0;
  font-size: 21px;
  letter-spacing: -0.05em;
  line-height: 1.2;
}

.record-card > p {
  display: -webkit-box;
  margin: 10px 0 0;
  overflow: hidden;
  color: var(--muted);
  font-size: 10px;
  line-height: 1.65;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.record-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 14px;
}

.record-tags span {
  padding: 4px 7px;
  border-radius: 7px;
  color: #536d66;
  background: #f1f6f3;
  font-size: 8px;
  font-weight: 700;
}

.record-detail-button {
  display: flex;
  min-height: 40px;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
  padding: 13px 0 0;
  color: var(--primary);
  background: transparent;
  font-size: 9px;
  font-weight: 850;
}

.record-detail-button .icon {
  width: 15px;
  height: 15px;
}

.empty-state {
  grid-column: 1 / -1;
  padding: 54px 24px;
  border: 1px dashed #c9d6d1;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.5);
  text-align: center;
}

.empty-icon {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  margin: 0 auto 14px;
  border-radius: 16px;
  color: var(--primary);
  background: #e2f3ec;
}

.empty-state h2 {
  margin: 0;
  font-size: 15px;
}

.empty-state p {
  margin: 7px auto 0;
  color: var(--muted);
  font-size: 10px;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 22px;
}

.pagination button {
  min-width: 70px;
  min-height: 38px;
  border: 1px solid var(--line);
  border-radius: 11px;
  color: #4f6065;
  background: white;
  font-size: 9px;
  font-weight: 800;
}

.pagination button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pagination span {
  min-width: 72px;
  color: var(--muted);
  font-size: 9px;
  text-align: center;
}

.pagination strong {
  color: var(--primary);
  font-size: 12px;
}

.admin-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(300px, 0.75fr);
  gap: 12px;
}

.admin-card,
.preview-card {
  min-width: 0;
  padding: 21px;
  border: 1px solid var(--line);
  border-radius: 20px;
  background: white;
}

.admin-card .admin-section-head,
.preview-card .admin-section-head {
  margin: 0;
}

.workflow-steps {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  margin: 19px 0 0;
  padding: 0;
  list-style: none;
}

.workflow-steps li {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 6px;
  color: #9aa7a4;
  font-size: 8px;
  font-weight: 750;
  text-align: center;
}

.workflow-steps li::before {
  position: absolute;
  z-index: 0;
  top: 12px;
  right: 50%;
  width: 100%;
  height: 1px;
  background: var(--line);
  content: "";
}

.workflow-steps li:first-child::before {
  display: none;
}

.workflow-steps span {
  position: relative;
  z-index: 1;
  display: grid;
  width: 25px;
  height: 25px;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: #f8faf9;
  font-size: 8px;
}

.workflow-steps .is-done,
.workflow-steps .is-active {
  color: var(--primary);
}

.workflow-steps .is-done::before,
.workflow-steps .is-active::before {
  background: rgba(8, 116, 91, 0.35);
}

.workflow-steps .is-done span,
.workflow-steps .is-active span {
  border-color: var(--primary);
  color: white;
  background: var(--primary);
}

.workflow-steps .is-active span {
  box-shadow: 0 0 0 5px rgba(8, 116, 91, 0.1);
}

.upload-zone {
  display: grid;
  min-height: 176px;
  place-items: center;
  align-content: center;
  gap: 6px;
  margin-top: 18px;
  padding: 22px;
  border: 1px dashed #9fbbb1;
  border-radius: 17px;
  color: var(--ink);
  background: #f3f8f5;
  text-align: center;
  cursor: pointer;
  transition: border-color 160ms ease, background 160ms ease;
}

.upload-zone:hover,
.upload-zone.is-dragging {
  border-color: var(--primary);
  background: #e9f6f1;
}

.upload-zone.is-busy {
  cursor: progress;
  opacity: 0.75;
}

.upload-zone input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.upload-icon {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  margin-bottom: 4px;
  border-radius: 14px;
  color: var(--primary);
  background: #dcefe8;
}

.upload-zone strong {
  font-size: 12px;
}

.upload-zone small {
  color: var(--muted);
  font-size: 8px;
}

.import-message,
.apply-note,
.button-help {
  margin: 11px 0 0;
  padding: 9px 11px;
  border-radius: 10px;
  color: #326b5d;
  background: #eef7f3;
  font-size: 9px;
  line-height: 1.5;
}

.import-message.is-error {
  color: #9d4438;
  background: #fff1ef;
}

.apply-note {
  color: #72531e;
  background: #fff8e8;
}

.button-help {
  padding: 0;
  color: var(--muted);
  background: transparent;
}

.sheet-picker {
  display: grid;
  grid-template-columns: auto minmax(140px, 1fr);
  align-items: center;
  gap: 7px 12px;
  margin-top: 12px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 13px;
  background: #fafcfb;
}

.sheet-picker label {
  font-size: 9px;
  font-weight: 800;
}

.sheet-picker select {
  min-height: 40px;
  padding: 0 34px 0 11px;
  background: white;
}

.sheet-picker span {
  grid-column: 2;
  color: var(--muted);
  font-size: 8px;
}

.admin-button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.primary-action,
.secondary-action,
.danger-action,
.text-action {
  display: inline-flex;
  min-height: 40px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 13px;
  border-radius: 12px;
  font-size: 9px;
  font-weight: 800;
}

.primary-action {
  color: white;
  background: var(--primary);
}

.secondary-action {
  border: 1px solid var(--line);
  color: #4f6065;
  background: white;
}

.danger-action {
  border: 1px solid #f0d4d0;
  color: #a24538;
  background: #fff3f1;
}

.text-action {
  color: var(--muted);
  background: transparent;
}

.primary-action:disabled,
.secondary-action:disabled,
.danger-action:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.button-icon {
  width: 15px;
  height: 15px;
}

.dataset-meta {
  display: grid;
  gap: 10px;
  margin-top: 18px;
}

.meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line);
  font-size: 9px;
}

.meta-row span {
  color: var(--muted);
}

.meta-row strong {
  max-width: 66%;
  overflow: hidden;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-badge {
  color: #77664d;
  background: #f2eee7;
}

.source-badge.is-admin {
  color: #11664f;
  background: #e5f3ee;
}

.preview-card,
.schema-card {
  margin-top: 12px;
}

.validation-summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-top: 18px;
}

.validation-summary > div {
  padding: 13px;
  border: 1px solid var(--line);
  border-radius: 13px;
  background: #f8faf9;
}

.validation-summary span,
.validation-summary strong {
  display: block;
}

.validation-summary span {
  color: var(--muted);
  font-size: 8px;
}

.validation-summary strong {
  margin-top: 5px;
  font-family: Georgia, serif;
  font-size: 20px;
}

.validation-summary .is-success strong { color: var(--primary); }
.validation-summary .is-warning strong { color: #a76820; }
.validation-summary .is-danger strong { color: #b04a3e; }

.fatal-callout {
  margin-top: 12px;
  padding: 13px 15px;
  border: 1px solid #f0d4d0;
  border-radius: 13px;
  color: #943d33;
  background: #fff3f1;
  font-size: 9px;
  line-height: 1.55;
}

.fatal-callout ul {
  margin: 6px 0 0;
  padding-left: 18px;
}

.preview-toolbar {
  display: grid;
  grid-template-columns: minmax(210px, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}

.compact-search input {
  min-height: 42px;
}

.compact-search .icon {
  width: 16px;
  height: 16px;
}

.toggle-field {
  display: inline-flex;
  min-height: 40px;
  align-items: center;
  gap: 7px;
  padding: 0 11px;
  border: 1px solid var(--line);
  border-radius: 11px;
  color: #52635f;
  background: white;
  font-size: 9px;
  font-weight: 750;
}

.toggle-field input {
  width: 15px;
  height: 15px;
  accent-color: var(--primary);
}

.preview-count {
  color: var(--muted);
  font-size: 9px;
}

.preview-table-wrap {
  max-width: 100%;
  margin-top: 11px;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 13px;
}

.preview-table {
  width: 100%;
  min-width: 760px;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 9px;
}

.preview-table th,
.preview-table td {
  max-width: 280px;
  padding: 11px 12px;
  overflow: hidden;
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-table th {
  position: sticky;
  z-index: 2;
  top: 0;
  color: #52635f;
  background: #eef4f1;
  font-weight: 850;
}

.preview-table tr:last-child td {
  border-bottom: 0;
}

.preview-table th:last-child,
.preview-table td:last-child {
  border-right: 0;
}

.preview-table tr.has-error td {
  color: #813a32;
  background: #fff5f3;
}

.preview-table .row-number-cell {
  position: sticky;
  z-index: 1;
  left: 0;
  width: 74px;
  color: var(--muted);
  background: #f8faf9;
  font-variant-numeric: tabular-nums;
}

.preview-table th.row-number-cell {
  z-index: 3;
  background: #e8f0ed;
}

.error-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-left: 5px;
  border-radius: 50%;
  background: #c65548;
}

.empty-cell {
  color: #a2acab;
  font-style: italic;
}

.table-empty {
  padding: 30px !important;
  color: var(--muted);
  text-align: center !important;
}

.issue-panel {
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px solid var(--line);
}

.validation-list {
  display: grid;
  max-height: 300px;
  gap: 7px;
  margin: 12px 0 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.validation-item {
  display: grid;
  grid-template-columns: 54px 1fr;
  gap: 8px;
  padding: 9px 11px;
  border-radius: 10px;
  color: #326b5d;
  background: #eef7f3;
  font-size: 9px;
  line-height: 1.5;
}

.validation-item.is-error {
  color: #9d4438;
  background: #fff1ef;
}

.validation-item.is-warning {
  color: #72531e;
  background: #fff8e8;
}

.all-clear {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0 0;
  color: var(--primary);
  font-size: 10px;
  font-weight: 750;
}

.all-clear .icon {
  width: 16px;
  height: 16px;
}

.schema-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 9px;
  margin-top: 18px;
}

.schema-grid > div {
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 13px;
  background: #f8faf9;
}

.schema-grid strong {
  font-size: 10px;
}

.schema-grid p {
  margin: 8px 0 0;
  line-height: 1.7;
}

.schema-grid code {
  padding: 3px 5px;
  border-radius: 5px;
  color: var(--primary-dark);
  background: #e4f2ed;
  font-family: Consolas, monospace;
  font-size: 9px;
}

.schema-grid small {
  display: block;
  margin-top: 8px;
  color: var(--muted);
  font-size: 8px;
  line-height: 1.55;
}

.sheet-dialog {
  position: fixed;
  width: min(calc(100% - 28px), 640px);
  max-height: min(84dvh, 760px);
  margin: auto;
  padding: 29px 24px 24px;
  overflow: auto;
  border: 0;
  border-radius: 24px;
  color: var(--ink);
  background: white;
  box-shadow: 0 30px 90px rgba(0, 0, 0, 0.32);
}

.sheet-dialog::backdrop {
  background: rgba(4, 17, 22, 0.68);
  backdrop-filter: blur(5px);
}

.dialog-handle {
  display: none;
}

.dialog-close {
  position: absolute;
  top: 14px;
  right: 14px;
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 50%;
  color: #62716f;
  background: #f0f4f2;
  font-size: 20px;
}

.sheet-dialog h2 {
  margin: 0;
  padding-right: 42px;
  font-size: 28px;
  letter-spacing: -0.055em;
}

.record-detail-list {
  display: grid;
  gap: 0;
  margin: 22px 0 0;
}

.record-detail-list > div {
  display: grid;
  grid-template-columns: minmax(100px, 0.3fr) 1fr;
  gap: 18px;
  padding: 13px 2px;
  border-bottom: 1px solid var(--line);
}

.record-detail-list dt {
  color: var(--muted);
  font-size: 9px;
  font-weight: 750;
}

.record-detail-list dd {
  margin: 0;
  font-size: 10px;
  line-height: 1.65;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.app-toast {
  position: fixed;
  z-index: 80;
  right: 18px;
  bottom: calc(82px + env(safe-area-inset-bottom));
  left: 18px;
  width: fit-content;
  max-width: min(calc(100% - 36px), 560px);
  margin: 0 auto;
  padding: 11px 15px;
  border: 1px solid rgba(114, 224, 189, 0.2);
  border-radius: 12px;
  color: white;
  background: #0a2c2a;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.22);
  font-size: 10px;
  font-weight: 700;
  text-align: center;
  opacity: 0;
  transform: translateY(12px);
  transition: opacity 160ms ease, transform 160ms ease;
  pointer-events: none;
}

.app-toast.is-visible {
  opacity: 1;
  transform: translateY(0);
}

.app-page .app-bottom-nav {
  --ink: #eef6f3;
  --primary: #72e0bd;
  --brand-bg: rgba(114, 224, 189, 0.14);
  --line: rgba(114, 224, 189, 0.18);
  --nav-bg: #071d25;
  --nav-muted: #8b9b9f;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  border-color: rgba(114, 224, 189, 0.18);
  background: rgba(7, 29, 37, 0.95);
  box-shadow: 0 -12px 40px rgba(5, 21, 27, 0.22);
}

.app-page .nav-item[aria-current="page"]::before {
  background: #72e0bd;
}

.recommend-panel,
.simulation-panel {
  padding: 24px;
  border-radius: 24px;
  color: white;
  background: #0b3d34;
  box-shadow: 0 18px 36px rgba(11, 61, 52, 0.14);
}

.recommend-panel h2,
.simulation-panel h2 {
  margin: 0;
  font-size: 19px;
  letter-spacing: -0.045em;
}

.recommend-panel > p:not(.section-kicker),
.simulation-panel-head p:last-child {
  margin: 8px 0 0;
  color: rgba(255, 255, 255, 0.6);
  font-size: 10px;
  line-height: 1.6;
}

.recommend-panel .section-kicker,
.simulation-panel .section-kicker {
  color: #72e0bd;
}

.recommend-options {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-top: 18px;
}

.recommend-option {
  display: flex;
  min-height: 52px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 8px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 13px;
  color: rgba(255, 255, 255, 0.76);
  background: rgba(255, 255, 255, 0.07);
  font-size: 9px;
  font-weight: 800;
}

.recommend-option .icon {
  width: 15px;
  height: 15px;
}

.recommend-option.is-active {
  border-color: #72e0bd;
  color: #0b3d34;
  background: #72e0bd;
}

.simulation-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.simulation-panel .text-action {
  flex: 0 0 auto;
  min-height: 34px;
  color: rgba(255, 255, 255, 0.68);
  background: rgba(255, 255, 255, 0.08);
}

.simulation-panel .text-action:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}

.subject-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 18px;
}

.subject-toggle {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  gap: 6px;
  padding: 0 11px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 999px;
  color: rgba(255, 255, 255, 0.76);
  background: rgba(255, 255, 255, 0.07);
  font-size: 9px;
  font-weight: 750;
}

.subject-toggle span {
  display: grid;
  width: 16px;
  height: 16px;
  place-items: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  font-size: 8px;
}

.subject-toggle.is-active {
  border-color: #72e0bd;
  color: #0b3d34;
  background: #72e0bd;
}

.subject-toggle.is-active span {
  color: white;
  background: #08745b;
}

.selector-empty {
  margin: 0;
  color: rgba(255, 255, 255, 0.6);
  font-size: 10px;
}

.simulation-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.simulation-result-card {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 16px;
  padding: 19px;
  border: 1px solid var(--line);
  border-radius: 20px;
  background: white;
}

.simulation-score > span {
  display: grid;
  width: 62px;
  height: 62px;
  place-items: center;
  align-content: center;
  border-radius: 50%;
  color: var(--primary);
  background: conic-gradient(var(--primary) var(--score), #e7efec 0);
  box-shadow: inset 0 0 0 7px white;
}

.simulation-score strong {
  font-family: Georgia, serif;
  font-size: 18px;
  line-height: 1;
}

.simulation-score small {
  font-size: 7px;
}

.simulation-result-copy > p:first-child {
  margin: 0;
  color: var(--muted);
  font-size: 8px;
}

.simulation-result-copy h3 {
  margin: 5px 0 0;
  font-size: 16px;
  letter-spacing: -0.04em;
}

.simulation-status {
  display: flex;
  gap: 10px;
  margin-top: 10px;
  font-size: 8px;
}

.simulation-status strong { color: var(--primary); }
.simulation-status span { color: var(--muted); }

.missing-subjects {
  margin-top: 11px;
}

.missing-subjects small {
  color: var(--muted);
  font-size: 8px;
}

.missing-subjects p {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 5px 0 0;
}

.missing-subjects span {
  padding: 4px 6px;
  border-radius: 6px;
  color: #8c5d26;
  background: #fff4e7;
  font-size: 7px;
}

.simulation-complete {
  margin: 11px 0 0;
  color: var(--primary);
  font-size: 8px;
  font-weight: 750;
}

.simulation-result-copy > button {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 12px;
  padding: 0;
  color: var(--primary);
  background: transparent;
  font-size: 8px;
  font-weight: 800;
}

.simulation-result-copy > button .icon {
  width: 13px;
  height: 13px;
}

@media (max-width: 820px) {
  .record-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .admin-layout {
    grid-template-columns: 1fr;
  }

  .recommend-options {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 620px) {
  .app-main {
    width: calc(100% - 28px);
    padding-top: 27px;
  }

  .header-db-status span {
    display: none;
  }

  .data-page-head {
    grid-template-columns: 1fr;
    gap: 14px;
  }

  .page-count {
    display: none;
  }

  .record-grid,
  .schema-grid,
  .simulation-grid {
    grid-template-columns: 1fr;
  }

  .record-card {
    min-height: 220px;
  }

  .results-head {
    align-items: flex-end;
  }

  .admin-card,
  .preview-card {
    padding: 17px;
  }

  .validation-summary {
    grid-template-columns: repeat(2, 1fr);
  }

  .preview-toolbar {
    grid-template-columns: 1fr auto;
  }

  .preview-count {
    grid-column: 1 / -1;
  }

  .sheet-dialog {
    right: 0;
    bottom: 0;
    left: 0;
    width: 100%;
    max-width: none;
    max-height: 88dvh;
    margin: auto 0 0;
    border-radius: 24px 24px 0 0;
  }

  .dialog-handle {
    display: block;
    width: 38px;
    height: 4px;
    margin: -14px auto 14px;
    border-radius: 999px;
    background: #d8dfdc;
  }
}

@media (max-width: 390px) {
  .data-page-head h1 {
    font-size: 33px;
  }

  .header-db-status {
    padding: 0 8px;
  }

  .workflow-steps small {
    font-size: 7px;
  }

  .sheet-picker {
    grid-template-columns: 1fr;
  }

  .sheet-picker span {
    grid-column: 1;
  }

  .record-detail-list > div {
    grid-template-columns: 1fr;
    gap: 5px;
  }

  .app-page .app-bottom-nav .nav-item {
    gap: 2px;
    font-size: 7.5px;
    letter-spacing: -0.06em;
  }

  .app-page .app-bottom-nav .nav-item .icon {
    width: 19px;
    height: 19px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .record-card,
  .app-toast {
    transition: none;
  }

  .initial-loading span {
    animation-duration: 1400ms;
  }
}