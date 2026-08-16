"use client";

import { useEffect, useState } from "react";
import { useStoredState } from "./use-hub-preference.js";
import { HarinIcon } from "./_design-system/harin-icon.js";
import { HarinPageAiRegion, HarinPageFrame, HarinPageHeader } from "./_design-system/harin-ui.js";

const count = (value) => Number(value || 0).toLocaleString("ko-KR");
const dateTime = (value) =>
  value
    ? new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(value))
    : "시각 없음";
const platformLabel = { NAVER: "네이버", COUPANG: "쿠팡", CAFE24: "Cafe24" };
const kindLabel = {
  INQUIRY: "문의",
  CANCEL: "취소",
  RETURN: "반품",
  EXCHANGE: "교환",
};
const couriers = [
  ["EPOST", "우체국택배"],
  ["CJGLS", "CJ대한통운"],
  ["HANJIN", "한진택배"],
  ["LOTTE", "롯데택배"],
  ["LOGEN", "로젠택배"],
];

async function fixedIpResult(response) {
  const initial = await response.json();
  if (response.status !== 202 || !initial.request?.id) return initial;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 750));
    const statusResponse = await fetch(
      `/api/coupang/operations/${initial.request.id}`,
      { cache: "no-store" },
    );
    const result = await statusResponse.json();
    if (statusResponse.status === 202) continue;
    return result;
  }
  return {
    ok: false,
    error:
      "서울 고정 IP 서버의 응답 시간이 초과됐습니다. 처리기록에서 상태를 확인해주세요.",
  };
}

function ChannelState({ item }) {
  return (
    <article
      className={`unifiedCsChannel ${String(item.status || "SETUP_REQUIRED").toLowerCase()}`}
    >
      <i aria-hidden="true" />
      <div>
        <b>{item.label}</b>
        <small>{item.message}</small>
      </div>
      <em>{item.statusLabel}</em>
    </article>
  );
}

function LinkedOrder({ row }) {
  const order = row.order;
  if (!row.orderId)
    return (
      <div className="unifiedCsNoOrder">주문번호가 없는 상품 문의입니다.</div>
    );
  if (!order)
    return (
      <div className="unifiedCsNoOrder">
        주문 {row.orderId} · 주문 상세 연결 대기
      </div>
    );
  return (
    <section className="unifiedCsOrderLink">
      <header>
        <span>연결된 주문</span>
        <b>{order.orderId}</b>
        <em>{order.status || "상태 확인 필요"}</em>
      </header>
      <div>
        <span>
          <small>주문시각</small>
          <b>{dateTime(order.orderedAt)}</b>
        </span>
        {order.shipmentBoxId && (
          <span>
            <small>배송번호</small>
            <b>{order.shipmentBoxId}</b>
          </span>
        )}
        <span>
          <small>주문금액</small>
          <b>{Number(order.amount || 0).toLocaleString("ko-KR")}원</b>
        </span>
      </div>
      {(order.products || []).length ? (
        <ul>
          {order.products.slice(0, 4).map((product, index) => (
            <li key={`${product.name}-${index}`}>
              <span>
                <b>{product.name}</b>
                {product.option && <small>{product.option}</small>}
              </span>
              <strong>{count(product.quantity)}개</strong>
            </li>
          ))}
        </ul>
      ) : (
        <small>상품 상세 연결 대기</small>
      )}
    </section>
  );
}

function AuditTrail({ audit }) {
  if (!audit)
    return (
      <small className="unifiedCsAudit emptyAudit">
        아직 실행한 처리기록이 없습니다.
      </small>
    );
  return (
    <small
      className={`unifiedCsAudit ${String(audit.status || "").toLowerCase()}`}
    >
      <b>최근 처리기록</b> · {audit.operationType} · {audit.status} ·{" "}
      {dateTime(audit.executedAt || audit.requestedAt)}
      {audit.errorMessage ? ` · ${audit.errorMessage}` : ""}
    </small>
  );
}

function ExternalInquiryCard({ row, templates }) {
  const [content, setContent] = useState("");
  const [template, setTemplate] = useState("");
  const [message, setMessage] = useState("");
  function applyTemplate(id) {
    setTemplate(id);
    const selected = (templates || []).find((entry) => entry.id === id);
    if (selected) setContent(selected.content);
  }
  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(content);
      setMessage(
        "답변 초안을 복사했습니다. 원본 판매자센터에서 확인 후 전송하세요.",
      );
    } catch {
      setMessage(
        "자동 복사가 막혔습니다. 답변 내용을 직접 선택해 복사해주세요.",
      );
    }
  }
  return (
    <article
      className={`unifiedCsWorkCard inquiry ${row.due.code.toLowerCase()}`}
    >
      <header>
        <div>
          <span className={`platformPill ${row.platform.toLowerCase()}`}>
            {platformLabel[row.platform]}
          </span>
          <span className="kindPill">{row.kindLabel}</span>
          <span className={`duePill ${row.due.code.toLowerCase()}`}>
            {row.due.label}
          </span>
        </div>
        <strong>문의 {row.sourceId}</strong>
      </header>
      <div className="unifiedCsQuestion">
        <small>{dateTime(row.occurredAt)}</small>
        {row.title && <b>{row.title}</b>}
        <p>{row.content}</p>
      </div>
      <LinkedOrder row={row} />
      {!row.completed && (
        <section className="unifiedCsReply externalChannelReply">
          <p className="unifiedCsSafetyNotice">
            {platformLabel[row.platform]} 원본 판매자센터에서 최종 처리하세요.
            이 화면은 누락 확인과 답변 초안 작성까지만 지원합니다.
          </p>
          <label>
            <span>답변 템플릿</span>
            <select
              value={template}
              onChange={(event) => applyTemplate(event.target.value)}
            >
              <option value="">직접 작성</option>
              {(templates || []).map((entry) => (
                <option value={entry.id} key={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <textarea
            rows="5"
            maxLength="1000"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="답변 초안을 작성한 뒤 복사하세요."
          />
          <footer>
            <small>
              직접 전송은 채널별 쓰기 검증 완료 전까지 잠겨 있습니다.
            </small>
            <button disabled={content.trim().length < 2} onClick={copyDraft}>
              답변 초안 복사
            </button>
          </footer>
        </section>
      )}
      {message && <p className="unifiedCsMessage">{message}</p>}
    </article>
  );
}

function CoupangInquiryCard({ row, templates }) {
  const item = row.source || {};
  const [replyBy, setReplyBy] = useStoredState("cs:reply-by", "");
  const [content, setContent] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [template, setTemplate] = useState("");
  function applyTemplate(id) {
    setTemplate(id);
    const selected = (templates || []).find((entry) => entry.id === id);
    if (selected) setContent(selected.content);
  }
  async function submit() {
    const action =
      item.inquiry_type === "CALL_CENTER"
        ? "REPLY_CALL_CENTER"
        : "REPLY_ONLINE";
    if (
      !window.confirm(
        `문의 ${item.inquiry_id}에 아래 답변을 실제 전송합니다.\n\n${content}\n\n전송할까요?`,
      )
    )
      return;
    setWorking(true);
    setMessage("서울 고정 IP 서버에서 전송 중…");
    try {
      const response = await fetch("/api/coupang/cs/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm: true,
          action,
          inquiryId: item.inquiry_id,
          replyBy,
          content,
          parentAnswerId: item.parent_answer_id,
        }),
      });
      const result = await fixedIpResult(response);
      if (!result.ok) throw new Error(result.error || "전송 실패");
      setMessage("답변 전송 완료 · 처리기록에 저장됐습니다.");
      setContent("");
      setTemplate("");
    } catch (error) {
      setMessage(`전송 실패 · ${error.message}`);
    } finally {
      setWorking(false);
    }
  }
  return (
    <article
      className={`unifiedCsWorkCard inquiry ${row.due.code.toLowerCase()}`}
    >
      <header>
        <div>
          <span className={`platformPill ${row.platform.toLowerCase()}`}>
            {platformLabel[row.platform]}
          </span>
          <span className="kindPill">{row.kindLabel}</span>
          <span className={`duePill ${row.due.code.toLowerCase()}`}>
            {row.due.label}
          </span>
        </div>
        <strong>문의 {row.sourceId}</strong>
      </header>
      <div className="unifiedCsQuestion">
        <small>
          {dateTime(row.occurredAt)}
          {row.due.ageHours != null
            ? ` · ${count(row.due.ageHours)}시간 경과`
            : ""}
        </small>
        <p>{row.content}</p>
      </div>
      <LinkedOrder row={row} />
      {!row.completed && (
        <section className="unifiedCsReply">
          <div>
            <label>
              <span>답변 템플릿</span>
              <select
                value={template}
                onChange={(event) => applyTemplate(event.target.value)}
              >
                <option value="">직접 작성</option>
                {(templates || []).map((entry) => (
                  <option value={entry.id} key={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>쿠팡 Wing 사용자 ID</span>
              <input
                value={replyBy}
                onChange={(event) => setReplyBy(event.target.value)}
                placeholder="답변 전송 계정"
              />
            </label>
          </div>
          <textarea
            rows="5"
            maxLength="1000"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="고객에게 보낼 답변을 확인한 뒤 전송하세요."
          />
          <footer>
            <small>
              템플릿은 초안입니다. 내용 확인 후에만 실제 전송됩니다.
            </small>
            <button
              disabled={working || !replyBy || content.trim().length < 2}
              onClick={submit}
            >
              {working ? "전송 중…" : "내용 확인 후 답변 전송"}
            </button>
          </footer>
        </section>
      )}
      {message && <p className="unifiedCsMessage">{message}</p>}
      <AuditTrail audit={row.audit} />
    </article>
  );
}

function ExternalClaimCard({ row }) {
  return (
    <article
      className={`unifiedCsWorkCard claim ${row.kind.toLowerCase()} ${row.due.code.toLowerCase()}`}
    >
      <header>
        <div>
          <span className={`platformPill ${row.platform.toLowerCase()}`}>
            {platformLabel[row.platform]}
          </span>
          <span className="kindPill">{kindLabel[row.kind]}</span>
          <span className={`duePill ${row.due.code.toLowerCase()}`}>
            {row.due.label}
          </span>
        </div>
        <strong>접수 {row.sourceId}</strong>
      </header>
      <div className="unifiedCsQuestion">
        <small>
          {dateTime(row.occurredAt)} · 상태 {row.status}
        </small>
        {row.title && <b>{row.title}</b>}
        <p>{row.content}</p>
      </div>
      <LinkedOrder row={row} />
      {!row.completed && (
        <p className="unifiedCsSafetyNotice standalone">
          {platformLabel[row.platform]} 원본 판매자센터에서 상태를 확인한 뒤
          처리하세요. 잘못된 채널로 반영되지 않도록 이 화면의 직접 처리 버튼은
          잠겨 있습니다.
        </p>
      )}
    </article>
  );
}

function CoupangClaimCard({ row }) {
  const item = row.source || {};
  const isReturn = row.kind !== "EXCHANGE";
  const [working, setWorking] = useState(false),
    [message, setMessage] = useState("");
  const [courier, setCourier] = useState("EPOST"),
    [invoice, setInvoice] = useState(""),
    [rejectCode, setRejectCode] = useState("SOLDOUT");
  async function run(action) {
    const labels = {
      RETURN_RECEIVE: "반품상품 입고 확인",
      RETURN_APPROVE: "반품 승인·환불",
      RETURN_PICKUP_INVOICE: "반품 회수송장 등록",
      EXCHANGE_PICKUP_INVOICE: "교환 회수송장 등록",
      EXCHANGE_RECEIVE: "교환상품 입고 확인",
      EXCHANGE_REJECT: "교환 거부",
      EXCHANGE_SHIPPING_INVOICE: "교환상품 출고송장 등록",
    };
    if (
      !window.confirm(
        `${labels[action]}을 실제 쿠팡에 반영합니다.\n주문 ${row.orderId || "-"} · 접수 ${row.sourceId}\n\n계속할까요?`,
      )
    )
      return;
    setWorking(true);
    setMessage("서울 고정 IP 서버에서 처리 중…");
    try {
      const response = await fetch("/api/coupang/cases/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm: true,
          action,
          receiptId: isReturn ? row.sourceId : undefined,
          exchangeId: isReturn ? undefined : row.sourceId,
          deliveryCompanyCode: courier,
          invoiceNumber: invoice,
          exchangeRejectCode: rejectCode,
          shipmentBoxId: item.shipment_box_id,
        }),
      });
      const result = await fixedIpResult(response);
      if (!result.ok) throw new Error(result.error || "처리 실패");
      setMessage(
        "처리 완료 · 감사기록에 저장됐으며 다음 수집에서 상태가 갱신됩니다.",
      );
      setInvoice("");
    } catch (error) {
      setMessage(`처리 실패 · ${error.message}`);
    } finally {
      setWorking(false);
    }
  }
  const pickupAction = isReturn
    ? "RETURN_PICKUP_INVOICE"
    : "EXCHANGE_PICKUP_INVOICE";
  return (
    <article
      className={`unifiedCsWorkCard claim ${row.kind.toLowerCase()} ${row.due.code.toLowerCase()}`}
    >
      <header>
        <div>
          <span className={`platformPill ${row.platform.toLowerCase()}`}>
            {platformLabel[row.platform]}
          </span>
          <span className="kindPill">{kindLabel[row.kind]}</span>
          <span className={`duePill ${row.due.code.toLowerCase()}`}>
            {row.due.label}
          </span>
        </div>
        <strong>접수 {row.sourceId}</strong>
      </header>
      <div className="unifiedCsQuestion">
        <small>
          {dateTime(row.occurredAt)} · 상태 {row.status}
        </small>
        <p>{row.content}</p>
        {item.collect_status && <em>회수 상태 · {item.collect_status}</em>}
      </div>
      <LinkedOrder row={row} />
      {!row.completed && (
        <section className="unifiedCsClaimActions">
          <div>
            {item.can_receive && (
              <button
                onClick={() =>
                  run(isReturn ? "RETURN_RECEIVE" : "EXCHANGE_RECEIVE")
                }
                disabled={working}
              >
                입고 확인
              </button>
            )}
            {item.can_approve && (
              <button
                className="danger"
                onClick={() => run("RETURN_APPROVE")}
                disabled={working}
              >
                반품 승인·환불
              </button>
            )}
            {item.can_reject && (
              <>
                <select
                  value={rejectCode}
                  onChange={(event) => setRejectCode(event.target.value)}
                >
                  <option value="SOLDOUT">교환상품 품절</option>
                  <option value="WITHDRAW">고객 철회</option>
                </select>
                <button
                  className="danger"
                  onClick={() => run("EXCHANGE_REJECT")}
                  disabled={working}
                >
                  교환 거부
                </button>
              </>
            )}
          </div>
          {(item.can_pickup_invoice || item.can_shipping_invoice) && (
            <div>
              <select
                value={courier}
                onChange={(event) => setCourier(event.target.value)}
              >
                {couriers.map(([code, name]) => (
                  <option value={code} key={code}>
                    {name}
                  </option>
                ))}
              </select>
              <input
                inputMode="numeric"
                value={invoice}
                onChange={(event) =>
                  setInvoice(event.target.value.replace(/\D/g, ""))
                }
                placeholder="송장번호"
              />
              {item.can_pickup_invoice && (
                <button
                  disabled={working || invoice.length < 6}
                  onClick={() => run(pickupAction)}
                >
                  회수송장 등록
                </button>
              )}
              {item.can_shipping_invoice && (
                <button
                  disabled={working || invoice.length < 6}
                  onClick={() => run("EXCHANGE_SHIPPING_INVOICE")}
                >
                  교환 출고송장
                </button>
              )}
            </div>
          )}
          {!item.can_receive &&
            !item.can_approve &&
            !item.can_reject &&
            !item.can_pickup_invoice &&
            !item.can_shipping_invoice && (
              <small>현재 상태에서는 직접 처리할 작업이 없습니다.</small>
            )}
        </section>
      )}
      {message && <p className="unifiedCsMessage">{message}</p>}
      <AuditTrail audit={row.audit} />
    </article>
  );
}

function InquiryCard(props) {
  return props.row.platform === "COUPANG" ? (
    <CoupangInquiryCard {...props} />
  ) : (
    <ExternalInquiryCard {...props} />
  );
}

function ClaimCard(props) {
  return props.row.platform === "COUPANG" ? (
    <CoupangClaimCard {...props} />
  ) : (
    <ExternalClaimCard {...props} />
  );
}

export default function UnifiedCustomerServiceCenter({ center, aiPanel }) {
  const data = center || {
    rows: [],
    active: [],
    channelStates: [],
    templates: [],
    summary: {},
  };
  const [platform, setPlatform] = useStoredState("filter:cs-platform", "ALL", [
    "ALL",
    "NAVER",
    "COUPANG",
    "CAFE24",
  ]);
  const [workspace, setWorkspace] = useState("ACTIVE");
  const [kind, setKind] = useStoredState("filter:cs-kind", "ALL", [
    "ALL",
    "INQUIRY",
    "CANCEL",
    "RETURN",
    "EXCHANGE",
  ]);
  const [due, setDue] = useStoredState("filter:cs-due", "ALL", [
    "ALL",
    "TODAY",
    "OVERDUE",
    "WAITING",
    "COMPLETED",
  ]);
  const [query, setQuery] = useStoredState("filter:cs-query", "");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [macroMessage, setMacroMessage] = useState("");
  const [visibleCount, setVisibleCount] = useState(20);
  async function copyQuickReply(template) {
    try {
      if (!navigator.clipboard) {
        throw new Error("Clipboard API is not available");
      }
      await navigator.clipboard.writeText(template.content);
      setMacroMessage(
        `‘${template.label}’ 양식을 복사했습니다. 내용을 확인한 뒤 답변에 붙여 넣으세요.`,
      );
    } catch {
      setMacroMessage(
        "이 브라우저에서는 자동 복사가 막혀 있습니다. 전체 답변 양식에서 문구를 직접 복사해 주세요.",
      );
    }
  }
  async function syncAllChannels() {
    setSyncing(true);
    setSyncMessage(
      "카페24는 바로 수집하고, 쿠팡·네이버는 고정 IP 서버에 요청 중…",
    );
    try {
      const response = await fetch("/api/customer-service/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const result = await response.json();
      if (!response.ok && response.status !== 202 && response.status !== 207)
        throw new Error(result.error || "수집 요청 실패");
      const summary = (result.jobs || [])
        .map((job) =>
          job.skipped
            ? `${platformLabel[job.platform]} 설정 필요`
            : `${platformLabel[job.platform]} ${job.ok ? "요청 완료" : "실패"}`,
        )
        .join(" · ");
      setSyncMessage(`${summary} · 잠시 뒤 화면을 새로고침합니다.`);
      window.setTimeout(() => window.location.reload(), 2500);
    } catch (error) {
      setSyncMessage(`전체 CS 수집 실패 · ${error.message}`);
    } finally {
      setSyncing(false);
    }
  }
  const rows = (data.rows || []).filter((row) => {
    if (workspace === "ACTIVE" && row.completed) return false;
    if (workspace === "CLAIMS" && (row.completed || row.kind === "INQUIRY"))
      return false;
    if (workspace === "HISTORY" && !row.completed) return false;
    if (workspace === "TEMPLATES") return false;
    if (platform !== "ALL" && row.platform !== platform) return false;
    if (kind !== "ALL" && row.kind !== kind) return false;
    if (due !== "ALL" && row.due.code !== due) return false;
    if (
      query &&
      !`${row.sourceId} ${row.orderId || ""} ${row.title || ""} ${row.content || ""} ${(row.order?.products || []).map((item) => `${item.name} ${item.option || ""}`).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase())
    )
      return false;
    return true;
  });
  useEffect(() => setVisibleCount(20), [workspace, platform, kind, due, query]);
  const visibleRows = rows.slice(0, visibleCount);
  const kindTabs = [
    ["ALL", "전체"],
    ["INQUIRY", "문의"],
    ["CANCEL", "취소"],
    ["RETURN", "반품"],
    ["EXCHANGE", "교환"],
  ];
  return (
    <HarinPageFrame kind="operations" className="unifiedCsCenter">
      <HarinPageHeader className="unifiedCsHero" eyebrow="고객 문의·클레임 업무" title="통합 CS·클레임센터" description="처리 요청, 클레임, 완료 이력, 답변 양식을 나눠 지금 할 일만 확인합니다." icon="customer" tone="pink" note="답변 양식은 초안이며 확인 전에는 채널로 자동 전송하지 않음" metrics={[["지금 처리할 항목",`${count(data.summary?.active)}건`],["기한 초과",`${count(data.summary?.overdue)}건`,null,data.summary?.overdue?'danger':''],["미답변 문의",`${count(data.summary?.unanswered)}건`],["주문 연결",`${count(data.summary?.linkedOrders)}건`]]}/>
      <section className="csFocusRail" aria-label="CS 우선 처리 항목">
        <button type="button" className={count(data.summary?.overdue)?"danger":""} onClick={()=>{setWorkspace("ACTIVE");setDue("OVERDUE");setKind("ALL");}}><HarinIcon name="alerts" size={22}/><span><small>가장 먼저</small><b>기한 초과 {count(data.summary?.overdue)}건</b></span><em>열기</em></button>
        <button type="button" onClick={()=>{setWorkspace("ACTIVE");setDue("ALL");setKind("INQUIRY");}}><HarinIcon name="customer" size={22}/><span><small>답변 필요</small><b>미답변 문의 {count(data.summary?.unanswered)}건</b></span><em>열기</em></button>
        <button type="button" onClick={()=>{setWorkspace("CLAIMS");setDue("ALL");setKind("ALL");}}><HarinIcon name="shield" size={22}/><span><small>상태 확인</small><b>클레임 {count(data.summary?.claims)}건</b></span><em>열기</em></button>
      </section>
      <div className="unifiedCsChannels">
        {(data.channelStates || []).map((item) => (
          <ChannelState item={item} key={item.platform} />
        ))}
      </div>
      <section className="unifiedCsSyncBar">
        <div>
          <b>전체 채널 CS 새로 수집</b>
          <small>
            카페24는 즉시 수집하고 쿠팡·네이버는 서울 고정 IP 서버에서
            처리합니다. 자동 수집은 매시간 실행됩니다.
          </small>
          {syncMessage && <em>{syncMessage}</em>}
        </div>
        <button disabled={syncing} onClick={syncAllChannels}>
          {syncing ? "수집 요청 중…" : "전체 CS 수집"}
        </button>
      </section>
      <section className="csQuickMacros"><header><span><HarinIcon name="sparkles" size={18}/><b>빠른 답변 양식</b></span><button type="button" onClick={()=>setWorkspace("TEMPLATES")}>전체 양식 보기</button></header><div>{(data.templates||[]).slice(0,4).map(template=><button type="button" key={template.id} onClick={()=>copyQuickReply(template)}><span>{template.label}</span><small>복사 후 확인</small></button>)}</div>{macroMessage?<p role="status">{macroMessage}</p>:null}</section>
      <nav className="phase13WorkspaceNav customer" aria-label="CS 작업공간">
        {[
          ["ACTIVE", "처리 요청", "미답변·오늘 할 일", data.summary?.active],
          ["CLAIMS", "클레임", "취소·반품·교환", data.summary?.claims],
          ["HISTORY", "처리 이력", "완료된 기록", data.summary?.completed],
          ["TEMPLATES", "답변 양식", "자주 쓰는 문구", data.templates?.length],
        ].map(([id, label, description, total]) => (
          <button
            type="button"
            className={workspace === id ? "active" : ""}
            onClick={() => {
              setWorkspace(id);
              if (id !== "ACTIVE") setKind("ALL");
            }}
            key={id}
          >
            <span>{label}</span>
            <small>{description}</small>
            <b>{count(total)}</b>
          </button>
        ))}
      </nav>
      {workspace === "ACTIVE" && <nav className="unifiedCsKindTabs" aria-label="CS 유형">
        {kindTabs.map(([id, label]) => (
          <button
            className={kind === id ? "active" : ""}
            onClick={() => setKind(id)}
            key={id}
          >
            <b>{label}</b>
            <small>
              {count(
                (data.rows || []).filter(
                  (row) =>
                    (id === "ALL" || row.kind === id) &&
                    !row.completed,
                ).length,
              )}
              건
            </small>
          </button>
        ))}
      </nav>}
      {workspace !== "TEMPLATES" && <section className="unifiedCsToolbar">
        <label>
          <span>채널</span>
          <select
            value={platform}
            onChange={(event) => setPlatform(event.target.value)}
          >
            <option value="ALL">전체 채널</option>
            <option value="NAVER">네이버</option>
            <option value="COUPANG">쿠팡</option>
            <option value="CAFE24">Cafe24</option>
          </select>
        </label>
        <label>
          <span>처리기한</span>
          <select value={due} onChange={(event) => setDue(event.target.value)}>
            <option value="ALL">전체 상태</option>
            <option value="OVERDUE">기한 초과</option>
            <option value="TODAY">오늘 처리</option>
            <option value="WAITING">답변 대기</option>
            <option value="COMPLETED">처리완료</option>
          </select>
        </label>
        <label className="search">
          <span>검색</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="접수·주문번호, 상품명, 문의 내용"
          />
        </label>
      </section>}
      {workspace === "TEMPLATES" ? (
        <section className="unifiedCsTemplateLibrary">
          <header>
            <div><span>REPLY LIBRARY</span><h2>확인 후 보내는 답변 양식</h2></div>
            <small>자동 전송하지 않습니다.</small>
          </header>
          <div>{(data.templates || []).map((template) => (
            <article key={template.id}>
              <span>{template.id}</span>
              <h3>{template.label}</h3>
              <p>{template.content}</p>
              <button type="button" onClick={() => navigator.clipboard?.writeText(template.content)}>문구 복사</button>
            </article>
          ))}</div>
        </section>
      ) : <div className="unifiedCsWorkList">
        {visibleRows.length ? (
          visibleRows.map((row) =>
            row.kind === "INQUIRY" ? (
              <InquiryCard row={row} templates={data.templates} key={row.id} />
            ) : (
              <ClaimCard row={row} key={row.id} />
            ),
          )
        ) : (
          <div className="unifiedCsEmpty">
            <b>이 조건에서 처리할 항목이 없습니다.</b>
            <span>
              연결되지 않은 채널은 위 상태 카드에서 확인할 수 있습니다.
            </span>
          </div>
        )}
      </div>}
      {workspace !== "TEMPLATES" && visibleRows.length < rows.length ? <button type="button" className="unifiedCsMore" onClick={() => setVisibleCount((value) => value + 20)}>CS 20건 더 보기 · 남은 {count(rows.length - visibleRows.length)}건</button> : null}
      <HarinPageAiRegion className="operationsAiSlot csAiSlot" id="page-ai-analysis" title="CS·클레임 AI 분석">{aiPanel}</HarinPageAiRegion>
      <details className="unifiedCsHelp">
        <summary><span><b>이 화면은 어떻게 쓰나요?</b><small>처리 순서와 표시 기준을 쉬운 말로 확인하세요.</small></span><em>도움말 열기</em></summary>
        <div><p><b>1. 기한 초과부터</b> 접수 후 24시간이 지난 미처리 문의를 먼저 확인합니다.</p><p><b>2. 주문 연결 확인</b> 문의 아래에서 상품과 배송상태를 보고 답변합니다.</p><p><b>3. 답변·처리 확인</b> 템플릿은 초안이며 확인창을 통과해야 실제 전송됩니다.</p><p><b>4. 기록 확인</b> 처리 결과는 최근 처리기록에서 성공·실패와 시각을 확인합니다.</p></div>
      </details>
    </HarinPageFrame>
  );
}
