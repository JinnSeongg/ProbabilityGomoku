import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { io, Socket } from "socket.io-client";
import { Check, Copy, Eye, EyeOff, LogIn, LogOut, Play, Send } from "lucide-react";
import { CARD_BY_ID } from "../../shared/cards";
import type { ChatMessage, ClientGameView, RuleSet, StoneColor } from "../../shared/types";
import "./styles.css";

type Ack = { ok: boolean; error?: string; roomId?: string; playerId?: string };

const socket: Socket = io({ path: "/Gomoku/socket.io" });

function App() {
  const [view, setView] = useState<ClientGameView | null>(null);
  const [chats, setChats] = useState<ChatMessage[]>([]);
  const [notice, setNotice] = useState("");
  const [hideRoomCode, setHideRoomCode] = useState(false);

  React.useEffect(() => {
    socket.on("roomStateUpdated", setView);
    socket.on("chatMessageReceived", (chat: ChatMessage) => setChats((prev) => [...prev.slice(-79), chat]));
    socket.on("leftRoom", () => {
      setView(null);
      setChats([]);
      setNotice("");
    });
    return () => {
      socket.off("roomStateUpdated");
      socket.off("chatMessageReceived");
      socket.off("leftRoom");
    };
  }, []);

  const send = (event: string, payload?: unknown) =>
    new Promise<Ack>((resolve) => {
      socket.emit(event, payload, (ack: Ack) => {
        if (!ack?.ok) setNotice(ack?.error ?? "요청에 실패했습니다.");
        else setNotice("");
        resolve(ack);
      });
    });

  if (!view) return <HomePage send={send} notice={notice} />;
  if (view.status === "waiting") return <LobbyPage view={view} send={send} notice={notice} hideRoomCode={hideRoomCode} setHideRoomCode={setHideRoomCode} />;
  if (view.status === "cardSelecting") return <CardSelectPage view={view} send={send} notice={notice} hideRoomCode={hideRoomCode} setHideRoomCode={setHideRoomCode} />;
  return <GamePage view={view} chats={chats} send={send} notice={notice} hideRoomCode={hideRoomCode} setHideRoomCode={setHideRoomCode} />;
}

function HomePage({ send, notice }: { send: (event: string, payload?: unknown) => Promise<Ack>; notice: string }) {
  const [nickname, setNickname] = useState("플레이어");
  const [roomId, setRoomId] = useState("");
  const [ruleSet, setRuleSet] = useState<RuleSet>("renju");
  const boardSize = 15;
  return (
    <main className="home">
      <section className="home-intro">
        <span className="section-kicker">Gomoku Room</span>
        <h1>확률 카드 오목</h1>
        <p>돌 색이 확률로 정해지는 카드 오목입니다.</p>
      </section>
      <section className="home-panel">
        <label>
          닉네임
          <input value={nickname} onChange={(event) => setNickname(event.target.value)} />
        </label>
        <label>
          룰 선택
          <div className="segmented" role="group" aria-label="게임 룰 선택">
            <button type="button" className={ruleSet === "renju" ? "active" : ""} onClick={() => setRuleSet("renju")}>
              렌주룰
            </button>
            <button type="button" className={ruleSet === "standard" ? "active" : ""} onClick={() => setRuleSet("standard")}>
              자유룰
            </button>
          </div>
        </label>
        <button className="primary" onClick={() => send("createRoom", { nickname, boardSize, ruleSet })}>
          <Play size={18} /> 방 만들기
        </button>
        <div className="join-row">
          <input placeholder="방 코드" value={roomId} onChange={(event) => setRoomId(event.target.value.toUpperCase())} />
          <button onClick={() => send("joinRoom", { roomId, nickname })}>
            <LogIn size={18} /> 입장
          </button>
        </div>
        {notice && <p className="notice">{notice}</p>}
      </section>
    </main>
  );
}

function LobbyPage({ view, send, notice, hideRoomCode, setHideRoomCode }: PageProps) {
  const isReady = view.me.ready;
  return (
    <main className="lobby">
      <header className="topbar">
        <h1>확률 카드 오목</h1>
        <TopActions roomId={view.roomId} send={send} hideRoomCode={hideRoomCode} setHideRoomCode={setHideRoomCode} showLeave />
      </header>
      <section className="lobby-grid">
        {view.players.map((player) => (
          <article key={player.playerId} className="player-tile">
            <Stone color={player.color} />
            <h2>{player.nickname}</h2>
            <p>{player.ready ? "준비 완료" : "대기 중"}</p>
          </article>
        ))}
      </section>
      <button className={`primary state-action ${isReady ? "ready" : "waiting"}`} onClick={() => send("playerReady")}>
        <Check size={18} /> {isReady ? "준비 완료" : "준비하기"}
      </button>
      {notice && <p className="notice">{notice}</p>}
    </main>
  );
}

function CardSelectPage({ view, send, notice, hideRoomCode, setHideRoomCode }: PageProps) {
  const [selected, setSelected] = useState<string[]>(view.me.selectedStartCards.map((card) => card.instanceId));
  const confirmed = view.me.selectedStartCards.length === 3;
  const toggle = (id: string) => {
    if (confirmed) return;
    setSelected((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : prev.length < 3 ? [...prev, id] : prev));
  };
  return (
    <main className="select-page">
      <header className="topbar">
        <h1>시작 카드 선택</h1>
        <TopActions roomId={view.roomId} send={send} hideRoomCode={hideRoomCode} setHideRoomCode={setHideRoomCode} showLeave />
      </header>
      <section className="candidate-grid">
        {view.me.startCardCandidates.map((instance) => (
          <CardButton key={instance.instanceId} instanceId={instance.instanceId} cardId={instance.cardId} active={selected.includes(instance.instanceId)} onClick={() => toggle(instance.instanceId)} />
        ))}
      </section>
      <button className={`primary state-action ${confirmed ? "ready" : "waiting"}`} disabled={selected.length !== 3 || confirmed} onClick={() => send("selectStartCards", { instanceIds: selected })}>
        <Check size={18} /> {confirmed ? "선택 완료" : `카드 확정 ${selected.length}/3`}
      </button>
      {notice && <p className="notice">{notice}</p>}
    </main>
  );
}

function GamePage({ view, chats, send, notice, hideRoomCode, setHideRoomCode }: GamePageProps) {
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [selectedTargets, setSelectedTargets] = useState<Array<{ x: number; y: number }>>([]);
  const [message, setMessage] = useState("");
  const activityRef = React.useRef<HTMLDivElement | null>(null);
  const me = view.players.find((player) => player.playerId === view.me.playerId);
  const current = view.players.find((player) => player.playerId === view.currentTurnPlayerId);
  const selectedDefinition = selectedCard ? CARD_BY_ID.get(view.me.hand.find((card) => card.instanceId === selectedCard)?.cardId ?? "") : null;
  const ownTurn = view.currentTurnPlayerId === view.me.playerId && view.status === "playing";
  const activityItems = useMemo(() => {
    const logItems = view.gameLog.slice(-30).map((entry) => ({ kind: "log" as const, id: entry.logId, createdAt: entry.createdAt, entry }));
    const chatItems = chats.slice(-30).map((chat) => ({ kind: "chat" as const, id: chat.id, createdAt: chat.createdAt, chat }));
    return [...logItems, ...chatItems].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()).slice(-50);
  }, [view.gameLog, chats]);
  const lastActivityId = activityItems.at(-1)?.id;

  React.useEffect(() => {
    const container = activityRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [lastActivityId]);

  React.useEffect(() => {
    if (!selectedCard) {
      setSelectedTargets([]);
      return;
    }
    if (!view.me.hand.some((card) => card.instanceId === selectedCard)) {
      setSelectedCard(null);
      setSelectedTargets([]);
    }
  }, [selectedCard, view.me.hand]);

  const useSelected = (x: number, y: number) => {
    if (view.me.pendingCardChoice) return;
    if (selectedCard && selectedDefinition?.requiresSelection) {
      const targetCount = selectedDefinition.value ?? 1;
      const alreadySelected = selectedTargets.some((target) => target.x === x && target.y === y);
      const nextTargets = alreadySelected ? selectedTargets.filter((target) => target.x !== x || target.y !== y) : [...selectedTargets, { x, y }].slice(0, targetCount);
      if (nextTargets.length >= targetCount) {
        send("useCard", { instanceId: selectedCard, cellTargets: nextTargets });
        setSelectedTargets([]);
        setSelectedCard(null);
        return;
      }
      setSelectedTargets(nextTargets);
      return;
    }
    if (ownTurn) send("placeStone", { x, y });
  };

  const handleCard = (instanceId: string) => {
    if (view.me.pendingCardChoice) return;
    const card = view.me.hand.find((entry) => entry.instanceId === instanceId);
    const definition = CARD_BY_ID.get(card?.cardId ?? "");
    if (!ownTurn || view.me.currentTurnUsedCard) return;
    if (definition?.requiresSelection) {
      setSelectedTargets([]);
      setSelectedCard((prev) => (prev === instanceId ? null : instanceId));
      return;
    }
    send("useCard", { instanceId });
  };

  return (
    <main className="game-shell">
      <header className="topbar game-top">
        <h1>확률 카드 오목</h1>
        <TopActions roomId={view.roomId} send={send} hideRoomCode={hideRoomCode} setHideRoomCode={setHideRoomCode} showLeave />
        <div className="turn-chip">{ruleLabel(view.ruleSet)} · 턴 {view.turnNumber}: {current?.nickname ?? "대기 중"}</div>
      </header>
      <section className="board-wrap">
        <GameBoard view={view} onCellClick={useSelected} selectedInfoMode={Boolean(selectedDefinition?.requiresSelection)} selectedTargets={selectedTargets} />
      </section>
      <HandPanel view={view} selectedCard={selectedCard} onCard={handleCard} />
      {view.me.pendingCardChoice && <CardChoicePanel view={view} send={send} />}
      <aside className="right-panel">
        <section>
          <h2>플레이어</h2>
          <div className="player-card-list">
            {view.players.map((player) => (
            <div className={`player-row ${player.playerId === view.currentTurnPlayerId ? "current" : ""}`} key={player.playerId}>
              <Stone color={player.color} />
              <div>
                <span>{player.nickname}{player.playerId === view.me.playerId ? " (나)" : ""}</span>
                <small>성공률: {player.successProbability}%</small>
              </div>
              <b>남은카드: {player.handCount}</b>
            </div>
            ))}
          </div>
        </section>
        <section>
          <h2>확률</h2>
          {view.currentProbability ? (
            <div className="probability-box">
              <div className="probability-main">성공확률 : <b>{view.currentProbability.selfColorProbability}%</b></div>
              {view.currentProbability.appliedModifiers.map((mod, index) => <small key={`${mod.label}-${index}`}>{modifierLabel(mod.label)}: {mod.value > 0 ? "+" : ""}{mod.value}%p</small>)}
            </div>
          ) : <p>게임 시작 대기 중</p>}
        </section>
        <section>
          <h2>효과</h2>
          {view.activeEffects.length === 0 ? <p>적용 중인 효과 없음</p> : view.activeEffects.map((effect) => <p key={effect.effectId}>{effectLabel(effect.sourceCardId, effect.effectType)}: {effect.value > 0 ? "+" : ""}{effect.value}%p, {effect.remainingTurns}턴</p>)}
        </section>
        <section className="activity-section">
          <h2>로그 / 채팅</h2>
          <div className="activity-scroll" ref={activityRef}>
            {activityItems.length === 0 ? <p className="empty-chat">아직 로그와 채팅이 없습니다.</p> : activityItems.map((item) => (
              item.kind === "log" ? <LogItem key={item.id} entry={item.entry} /> : <p className="chat-entry" key={item.id}><b>{item.chat.nickname}</b> {item.chat.message}</p>
            ))}
          </div>
          <form className="activity-chat-form" onSubmit={(event) => {
            event.preventDefault();
            if (!message.trim()) return;
            send("sendChatMessage", { message });
            setMessage("");
          }}>
            <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="채팅 입력" />
            <button title="채팅 보내기"><Send size={16} /></button>
          </form>
        </section>
      </aside>
      {notice && <div className="toast">{notice}</div>}
      {view.status === "finished" && <ResultModal view={view} send={send} />}
      {view.me.pendingCardChoice && <div className="hint">카드 후보 3장 중 1장을 선택하세요.</div>}
      {selectedDefinition?.requiresSelection && <div className="hint">빈칸을 선택하세요: {selectedDefinition.name} ({selectedTargets.length}/{selectedDefinition.value ?? 1})</div>}
      {me && !ownTurn && view.status === "playing" && <div className="hint muted">상대 턴 진행 중</div>}
    </main>
  );
}

function LogItem({ entry }: { entry: ClientGameView["gameLog"][number] }) {
  const card = findCardInLog(entry.message);
  if (!card) return <p className={`log-entry ${entry.type}`}>{entry.message}</p>;
  return (
    <details className={`log-entry log-card ${entry.type}`}>
      <summary>{entry.message}</summary>
      <div className="log-card-detail">
        <b>{card.name}</b>
        <span>{card.description}</span>
      </div>
    </details>
  );
}

function findCardInLog(message: string) {
  const usedMatch = message.match(/님이 (.+) 카드를 사용했습니다\.$/);
  const pickedMatch = message.match(/님이 (.+)을\(를\) 선택했습니다\.$/);
  const cardName = usedMatch?.[1] ?? pickedMatch?.[1];
  if (!cardName) return null;
  return Array.from(CARD_BY_ID.values()).find((card) => card.name === cardName) ?? null;
}

function GameBoard({ view, onCellClick, selectedInfoMode, selectedTargets }: { view: ClientGameView; onCellClick: (x: number, y: number) => void; selectedInfoMode: boolean; selectedTargets: Array<{ x: number; y: number }> }) {
  const predictionMap = useMemo(() => new Map(view.predictions.filter((p) => p.predictionType === "cell").map((p) => [`${p.x},${p.y}`, p])), [view.predictions]);
  const winSet = useMemo(() => new Set(view.winningLine.map((point) => `${point.x},${point.y}`)), [view.winningLine]);
  const selectedTargetSet = useMemo(() => new Set(selectedTargets.map((point) => `${point.x},${point.y}`)), [selectedTargets]);
  const successProbability = view.currentProbability ? `${view.currentProbability.selfColorProbability}% 성공` : "확률 계산 전";
  return (
    <div className={`board size-${view.boardSize} my-${view.me.color}`} style={{ gridTemplateColumns: `repeat(${view.boardSize}, 1fr)`, gridTemplateRows: `repeat(${view.boardSize}, 1fr)` }}>
      {view.board.flat().map((cell) => {
        const prediction = predictionMap.get(`${cell.x},${cell.y}`);
        return (
          <button
            key={`${cell.x}-${cell.y}`}
            className={`cell ${cell.stone ? "occupied" : ""} ${prediction ? "predicted" : ""} ${selectedInfoMode ? "selecting" : ""} ${selectedTargetSet.has(`${cell.x},${cell.y}`) ? "selected-target" : ""} ${winSet.has(`${cell.x},${cell.y}`) ? "win" : ""}`}
            onClick={() => onCellClick(cell.x, cell.y)}
            disabled={Boolean(cell.stone)}
            title={successProbability}
          >
            {cell.stone && <Stone color={cell.stone} />}
            {!cell.stone && prediction && <Stone color={prediction.resultColor} ghost />}
          </button>
        );
      })}
    </div>
  );
}

function CardChoicePanel({ view, send }: { view: ClientGameView; send: (event: string, payload?: unknown) => Promise<Ack> }) {
  const pending = view.me.pendingCardChoice;
  if (!pending) return null;
  return (
    <section className="choice-panel" aria-label="카드 선택 후보">
      <div className="choice-title">선택 보급</div>
      <div className="choice-list">
        {pending.options.map((instance) => (
          <CardButton key={instance.instanceId} instanceId={instance.instanceId} cardId={instance.cardId} onClick={() => send("chooseCard", { instanceId: instance.instanceId })} />
        ))}
      </div>
    </section>
  );
}

function HandPanel({ view, selectedCard, onCard }: { view: ClientGameView; selectedCard: string | null; onCard: (id: string) => void }) {
  const disabled = view.currentTurnPlayerId !== view.me.playerId || Boolean(view.me.currentTurnUsedCard) || Boolean(view.me.pendingCardChoice) || view.status !== "playing";
  return (
    <section className="hand-panel">
      <div className="hand-list">
        {view.me.hand.map((instance) => (
          <CardButton key={instance.instanceId} instanceId={instance.instanceId} cardId={instance.cardId} active={selectedCard === instance.instanceId} disabled={disabled} onClick={() => onCard(instance.instanceId)} />
        ))}
      </div>
    </section>
  );
}

function CardButton({ instanceId, cardId, active, disabled, onClick }: { instanceId: string; cardId: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  const card = CARD_BY_ID.get(cardId);
  return (
    <button className={`card-item ${active ? "active" : ""}`} disabled={disabled} onClick={onClick} title={card?.description}>
      <span>{card?.name ?? instanceId}</span>
      <small>{card?.description}</small>
    </button>
  );
}

function ResultModal({ view, send }: { view: ClientGameView; send: (event: string, payload?: unknown) => Promise<Ack> }) {
  const winner = view.players.find((player) => player.playerId === view.winnerPlayerId);
  const didWin = view.winnerPlayerId === view.me.playerId;
  return (
    <div className="modal-backdrop">
      <section className={`result-modal ${didWin ? "win" : "lose"}`}>
        <span className="result-kicker">게임 결과</span>
        <h2>{didWin ? "승리" : "패배"}</h2>
        <p>{didWin ? "내가 승리했습니다." : `${winner?.nickname ?? "상대"}님이 승리했습니다.`}</p>
        <button className="primary" onClick={() => send("resetGame")}>
          <Check size={18} /> 확인
        </button>
      </section>
    </div>
  );
}

function TopActions({ roomId, send, hideRoomCode, setHideRoomCode, showLeave }: TopActionsProps) {
  return (
    <div className="top-actions">
      <RoomCode roomId={roomId} hidden={hideRoomCode} />
      <button className="icon-button top-icon" onClick={() => setHideRoomCode((value) => !value)} title={hideRoomCode ? "방 코드 보이기" : "방 코드 숨기기"}>
        {hideRoomCode ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
      {showLeave && (
        <button className="secondary" onClick={() => send("leaveRoom")}>
          <LogOut size={18} /> 나가기
        </button>
      )}
    </div>
  );
}

function RoomCode({ roomId, hidden }: { roomId: string; hidden: boolean }) {
  return (
    <button className="room-code" onClick={() => copyRoomCode(roomId)} title="방 코드 복사">
      <Copy size={16} />
      <span className={hidden ? "code-text hidden-code" : "code-text"}>{hidden ? "•••••" : roomId}</span>
    </button>
  );
}

function Stone({ color, ghost }: { color: StoneColor; ghost?: boolean }) {
  return <span className={`stone ${color} ${ghost ? "ghost" : ""}`} />;
}

type PageProps = {
  view: ClientGameView;
  send: (event: string, payload?: unknown) => Promise<Ack>;
  notice: string;
  hideRoomCode: boolean;
  setHideRoomCode: React.Dispatch<React.SetStateAction<boolean>>;
};

type GamePageProps = PageProps & {
  chats: ChatMessage[];
};

type TopActionsProps = {
  roomId: string;
  send: (event: string, payload?: unknown) => Promise<Ack>;
  hideRoomCode: boolean;
  setHideRoomCode: React.Dispatch<React.SetStateAction<boolean>>;
  showLeave?: boolean;
};

async function copyRoomCode(roomId: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(roomId);
      return;
    }
  } catch {
    // Fall through to the legacy copy path below.
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = roomId;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  } catch {
    // Copy is a best-effort UI convenience.
  }
}

function effectLabel(cardId: string, effectType: string): string {
  const cardName = CARD_BY_ID.get(cardId)?.name;
  if (cardName) return cardName;
  const labels: Record<string, string> = {
    probabilityBuff: "확률 강화",
    probabilityDebuff: "확률 방해",
    insurance: "보험",
    retry: "재시도",
    rage: "분노",
    balance: "균형",
    resistFate: "운명 저항"
  };
  return labels[effectType] ?? "효과";
}

function modifierLabel(label: string): string {
  const labels: Record<string, string> = {
    "湲곕낯 ?뺣쪧": "기본 확률",
    "遺덉슫 ?ㅽ깮": "불운 스택",
    "Base chance": "기본 확률",
    "Bad luck stack": "불운 스택"
  };
  return labels[label] ?? label;
}

function ruleLabel(ruleSet: RuleSet): string {
  return ruleSet === "renju" ? "렌주룰" : "자유룰";
}

createRoot(document.getElementById("root")!).render(<App />);

