// English / 한국어 menus for every page.
// Pages are written in English. In Korean mode this module translates the visible text
// (and placeholders, titles, labels, pop-ups) as it appears, using the dictionary below.
// Card words, team names and book titles are never touched.
// The choice is one setting for the whole site and follows across windows (class view too).

const KEY = 'ui.lang.v1';
const OLD_KEY = 'online.ui.v1';
const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
let lang = read(KEY) || read(OLD_KEY) || ((navigator.language || '').startsWith('ko') ? 'ko' : 'en');
const listeners = new Set();

export const getLang = () => lang;
export function setLang(l) {
  if (l !== 'en' && l !== 'ko') return;
  if (l === lang) return;
  lang = l;
  try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* storage off */ }
  apply();
}
export function onLangChange(fn) { listeners.add(fn); }

/* ---------------- dictionary ---------------- */

const KO = {
  // home
  'CEFR Word Games': '단어 게임',
  'Nadu Word Games': '나두 단어 게임',
  'Pick a game': '게임 고르기',
  'Vocabulary games · A1 to C2 · 한국어 TOPIK 1–6': '단어 게임 · 영어 A1–C2 · 한국어 TOPIK 1–6', 'Vocabulary games': '단어 게임',
  'Explain the word without saying the taboo words. Only the explainer sees the card.': '금지어를 말하지 않고 단어를 설명해요. 설명하는 사람만 카드를 봐요.',
  'One player can’t see the word. Their team describes it until they guess.': '한 사람은 단어를 볼 수 없어요. 같은 팀이 설명하면 맞혀요.',
  'The player in the hot seat asks yes/no questions. Everyone else answers only yes, no or maybe.': '핫시트에 앉은 사람이 예/아니요 질문을 해요. 다른 사람들은 예, 아니요, 글쎄요로만 대답해요.',
  'One screen': '한 화면으로',
  'Class or table, teams share a screen': '교실이나 테이블에서 팀이 한 화면을 같이 봐요',
  'Own devices': '각자 기기로',
  'Everyone on their own phone, anywhere': '어디서든 각자 휴대폰으로',
  'Every game works in English or Korean. On one screen each team picks the language it explains in; on your own devices each player does.':
    '모든 게임을 영어나 한국어로 할 수 있어요. 한 화면에서는 팀마다, 각자 기기로 할 때는 사람마다 설명할 언어를 골라요.',
  'All games': '모든 게임',
  Language: '언어',

  // games & styles
  Taboo: '타부', 'Taboo CEFR': '타부', 'Taboo CEFR — Explainer': '타부 — 설명하는 사람', 'Taboo CEFR — Class view': '타부 — 교실 화면',
  'Hot Seat': '핫시트', 'Hot Seat CEFR': '핫시트', 'Hot Seat — Class view': '핫시트 — 교실 화면', 'Who Am I?': '나는 누구?',
  'Hot Seat · up next': '핫시트 · 다음 차례', 'Who Am I? · up next': '나는 누구? · 다음 차례',
  'Hot Seat · get ready': '핫시트 · 준비', 'Who Am I? · get ready': '나는 누구? · 준비',
  'One student sits facing away from the screen. Their team describes the word and they guess.': '한 학생이 화면을 등지고 앉아요. 같은 팀이 단어를 설명하면 그 학생이 맞혀요.',
  'The student in the hot seat asks yes/no questions. The class can only answer yes, no or maybe.': '핫시트의 학생이 예/아니요 질문을 해요. 반 친구들은 예, 아니요, 글쎄요로만 대답해요.',
  '🪑 Hot seat: sit facing away from the screen.': '🪑 핫시트: 화면을 등지고 앉으세요.',
  'Hot seat: sit facing away from the screen.': '핫시트: 화면을 등지고 앉으세요.',
  'Describe the word. Don’t say it, spell it or switch languages.': '단어를 설명하세요. 단어를 말하거나, 철자를 말하거나, 다른 언어를 쓰면 안 돼요.',
  'Ask yes/no questions. Class: answer only yes, no or maybe.': '예/아니요 질문을 하세요. 반 친구들은 예, 아니요, 글쎄요로만 대답해요.',
  '(someone said the word, spelled it or switched languages)': '(누군가 단어를 말하거나, 철자를 말하거나, 다른 언어를 썼을 때)',
  '(someone gave more than yes, no or maybe)': '(누군가 예, 아니요, 글쎄요 말고 다른 말을 했을 때)',

  // setup
  Game: '게임', 'Game style': '게임 방식', Decks: '덱', Teams: '팀', Rules: '규칙', Extras: '추가 설정', 'Game length': '게임 길이',
  'Turn timer': '제한 시간', seconds: '초', Skips: '패스', Passes: '패스', Free: '무료', 'Some free, then −1': '몇 번 무료, 그다음 −1', 'Always −1': '항상 −1',
  'free per turn': '번 무료 (한 턴에)', 'Taboo word said': '금지어를 말하면', 'Rule broken': '규칙 위반', 'Costs 1 point': '1점 감점', 'Costs the team 1 point': '팀 1점 감점',
  'turns per team': '턴 (팀마다)', '(0 = until you end it)': '(0 = 직접 끝낼 때까지)', Rounds: '라운드',
  'Words to avoid': '피할 단어', "Harder: show 3 words the clue-givers can't say": "더 어렵게: 설명하는 사람이 말하면 안 되는 단어 3개 보여 주기",
  'Show the turn\'s words at the end so the guesser can see them': '턴이 끝나면 맞힌 사람도 볼 수 있게 단어 보여 주기',
  "Show the turn's words on the class view when time is up": '시간이 끝나면 교실 화면에 이번 턴 단어 보여 주기',
  'Sound effects': '효과음', 'Start game ▶': '게임 시작 ▶', 'Resume game': '게임 이어 하기', 'A game is still in progress.': '진행 중인 게임이 있어요.',
  'Pick at least one card set to start.': '시작하려면 덱을 하나 이상 고르세요.', 'Pick at least one deck.': '덱을 하나 이상 고르세요.',
  'Every word has been played, so the next game starts a fresh round.': '모든 단어가 나왔어요. 다음 게임은 처음부터 다시 섞어요.',
  'Start fresh': '처음부터', '🔀 Shuffle order': '🔀 순서 섞기', 'Shuffle the team order automatically when each game starts': '게임을 시작할 때마다 팀 순서 자동으로 섞기',
  '⧉ Class view': '⧉ 교실 화면', 'Open the class view in a new window for the projector': '프로젝터용 교실 화면을 새 창으로 열기',
  'Open the class view in a new window for a second screen': '두 번째 화면용 교실 화면을 새 창으로 열기',
  'Full screen (F)': '전체 화면 (F)', 'Pause (P)': '일시 정지 (P)', 'Fewer teams': '팀 줄이기', 'More teams': '팀 늘리기',
  'Drag to reorder': '끌어서 순서 바꾸기', 'Move up': '위로', 'Move down': '아래로', 'Pick a colour': '색 고르기',
  'Put the teams in a random order': '팀 순서를 무작위로 섞기',
  Red: '빨강', Orange: '주황', Yellow: '노랑', Lime: '연두', Green: '초록', Teal: '청록', Blue: '파랑', Purple: '보라', Pink: '분홍', Brown: '갈색', Navy: '남색',

  // deck picker
  All: '전체', CEFR: 'CEFR', Korean: '한국어', 'My decks': '내 덱', 'My cards': '내 카드', Selected: '선택됨', Sort: '정렬',
  'Level order': '레벨 순', 'A–Z': '가나다순', 'Most cards': '카드 많은 순', 'Clear selection': '선택 해제', 'Select all': '모두 선택', 'Unselect all': '모두 해제',
  'CEFR levels': 'CEFR 레벨', '한국어 · TOPIK levels': '한국어 · TOPIK 레벨', 'Cards you added': '내가 추가한 카드', 'Your deck': '내 덱',
  'CEFR · Beginner': 'CEFR · 입문', 'CEFR · Elementary': 'CEFR · 초급', 'CEFR · Intermediate': 'CEFR · 중급', 'CEFR · Upper-intermediate': 'CEFR · 중상급',
  'CEFR · Advanced': 'CEFR · 고급', 'CEFR · Proficiency': 'CEFR · 최상급',
  'Search decks': '덱 검색', 'Search decks, e.g. Write Now': '덱 검색 (예: Write Now)', 'Search decks, e.g. TOPIK': '덱 검색 (예: TOPIK)', 'Filter decks': '덱 거르기',
  'No decks match.': '맞는 덱이 없어요.', 'No decks selected yet.': '아직 고른 덱이 없어요.',
  '＋ New deck': '＋ 새 덱', 'Pick units, words or write your own': '단원이나 단어를 고르거나 직접 써요',

  // card manager
  Cards: '카드', 'Manage cards': '카드 관리', 'Manage cards…': '카드 관리…', 'Include all': '모두 포함', 'Exclude all': '모두 제외', 'Search this set…': '이 덱에서 검색…',
  'Add card': '카드 추가', Add: '추가', 'New word': '새 단어', 'Taboo / clue words, separated by commas': '금지어/힌트 단어, 쉼표로 구분',
  'Shared by Taboo and Hot Seat. Saved in this browser.': '타부와 핫시트에서 같이 써요. 이 브라우저에 저장돼요.',
  Export: '내보내기', Import: '가져오기', Delete: '삭제', added: '추가함', yours: '내가 씀', Done: '완료', 'Nothing matches.': '맞는 게 없어요.', 'remove card': '카드 삭제',
  'Remove this card from future games': '앞으로 이 카드 빼기', 'Too hard — remove this card for good': '너무 어려워요 — 이 카드 빼기',

  '← Decks': '← 덱 목록', '🗂 Manage cards': '🗂 카드 관리', 'Search decks…': '덱 검색…', 'Search this deck…': '이 덱에서 검색…',
  'Name it, then add cards': '이름을 정하고 카드를 추가해요', 'No cards yet — add your first one above.': '아직 카드가 없어요 — 위에서 첫 카드를 추가하세요.',
  'Shared by every game. Saved in this browser.': '모든 게임에서 같이 써요. 이 브라우저에 저장돼요.',

  '📺 Main screen for a TV or projector': '📺 TV·프로젝터용 메인 화면', 'Shows an online game to the whole room; everyone plays on their phones.': '온라인 게임을 방 전체에 보여 줘요. 플레이는 각자 휴대폰으로 해요.',
  'Main screen': '메인 화면', 'Full screen (F)': '전체 화면 (F)',

  // deck builder
  'Deck name': '덱 이름', 'Deck name, e.g. Week 10 Review': '덱 이름 (예: 10주 차 복습)', 'Delete deck': '덱 삭제', 'Add words': '단어 추가',
  'Book or level': '책 또는 레벨', 'Search every deck': '모든 덱에서 검색', 'Search every deck…': '모든 덱에서 검색…', 'All units': '모든 단원',
  'In this deck': '이 덱에 있는 단어', 'Remove all': '모두 빼기', 'Your own word': '직접 쓴 단어', '3 taboo words, comma-separated': '금지어 3개, 쉼표로 구분',
  'Add to deck': '덱에 추가', 'All added': '모두 추가함', 'Already in the deck': '이미 덱에 있어요', 'This word is already in the deck': '이 단어는 이미 덱에 있어요',
  'Pick words on the left, or add your own above.': '왼쪽에서 단어를 고르거나 위에 직접 추가하세요.', 'No words here.': '단어가 없어요.', 'No words match.': '맞는 단어가 없어요.',
  'No cards yet — add your own above.': '아직 카드가 없어요 — 위에서 추가하세요.', 'Untitled deck': '이름 없는 덱', Extra: '추가',

  // a team's own decks
  'Shared decks': '공용 덱', 'Same decks as everyone': '모두와 같은 덱 쓰기', 'Pick the decks this team draws from': '이 팀이 쓸 덱 고르기',
  'This team uses the decks picked in step 1. Untick to give it its own.': '이 팀은 1단계에서 고른 덱을 써요. 체크를 풀면 따로 고를 수 있어요.',

  // play
  'Up next': '다음 차례', 'Get ready': '준비', 'Go!': '시작!', 'Start turn': '턴 시작', Pause: '일시 정지', Paused: '일시 정지', Resume: '계속하기',
  'Keep playing': '계속하기', 'End game': '게임 끝내기', 'New game': '새 게임', 'Game over': '게임 끝', 'Card hidden': '카드 숨김', 'Word hidden': '단어 숨김',
  Correct: '정답', 'Correct!': '정답!', 'Don’t say': '금지어', "Don't say": '금지어', Skip: '패스', Pass: '패스', 'Taboo!': '금지어!', 'TABOO!': '금지어!', 'Rule broken!': '규칙 위반!',
  '↶ Undo last': '↶ 되돌리기', 'Time\'s up': '시간 끝', "Time's up!": '시간 끝!', 'Time’s up!': '시간 끝!',
  "Time's up — the hot seat can turn around": '시간 끝 — 핫시트는 돌아봐도 돼요', "Time's up! Hot seat, turn around": '시간 끝! 핫시트, 돌아보세요',
  'Fix any mistakes before confirming — tap a symbol to change it.': '확인하기 전에 실수를 고치세요 — 기호를 누르면 바뀌어요.',
  'Confirm & next team': '확인하고 다음 팀', '−1 point': '−1점', 'It’s a tie!': '동점이에요!', "It's a tie!": '동점이에요!',
  'Skips are free': '패스는 무료', 'Every skip costs 1 point': '패스하면 매번 1점 감점', 'Skips cost 1 point': '패스하면 1점 감점',
  'Passes are free': '패스는 무료', 'Every pass costs 1 point': '패스하면 매번 1점 감점', 'Passes cost 1 point': '패스하면 1점 감점',
  'Taboo −1': '금지어 −1', 'Taboo word = −1': '금지어 = −1', 'Rule broken −1': '규칙 위반 −1', 'Rule broken = −1': '규칙 위반 = −1',
  'Explain in English': '영어로 설명', 'Explain in Korean': '한국어로 설명', 'Hand the screen to the explainer.': '설명하는 사람에게 화면을 넘기세요.',
  'Plus one': '1점 더하기', 'Minus one': '1점 빼기', English: '영어', '한국어': '한국어',

  // pop-ups
  'Start a new game? The current scores will be cleared.': '새 게임을 시작할까요? 지금 점수는 지워져요.',
  'Count the points from the current turn?': '이번 턴 점수를 더할까요?',
  'End the game and show the final scores?': '게임을 끝내고 최종 점수를 볼까요?',
  'There are no cards left in the selected sets.': '고른 덱에 남은 카드가 없어요.',
  'That file could not be read.': '파일을 읽을 수 없어요.',
  'Remove every card from this deck? Cards you wrote for it will be deleted.': '이 덱의 카드를 모두 뺄까요? 직접 쓴 카드는 삭제돼요.',
  'Your browser blocked the pop-up. Allow pop-ups for this site, or open /class.html in a new window.': '브라우저가 새 창을 막았어요. 이 사이트의 팝업을 허용하거나 /class.html을 새 창으로 여세요.',
  'Your browser blocked the pop-up. Allow pop-ups for this site, or open /hotseat-class.html in a new window.': '브라우저가 새 창을 막았어요. 이 사이트의 팝업을 허용하거나 /hotseat-class.html을 새 창으로 여세요.',
  'Invite link': '초대 링크', 'End the game for everyone?': '모두의 게임을 끝낼까요?',
};

const n = (x) => x; // readability in patterns below
const nm = (x) => tr(x) ?? x; // a team name: translated only if it's a default one (Team 2 → 2팀)
const PATTERNS = [
  [/^(\d+) cards?$/, (m) => `카드 ${n(m[1])}장`],
  [/^(\d+) words?$/, (m) => `단어 ${m[1]}개`],
  [/^(\d+) of (\d+) included$/, (m) => `${m[2]}장 중 ${m[1]}장 포함`],
  [/^(\d+) not played yet, so those come first\.$/, (m) => `아직 안 나온 카드 ${m[1]}장이 먼저 나와요.`],
  [/^(\d+) cards in play from (.+)\.$/, (m) => `사용할 카드 ${m[1]}장: ${m[2]}.`],
  [/^(\d+) cards · (\d+) teams · (\d+)s turns$/, (m) => `카드 ${m[1]}장 · ${m[2]}팀 · 한 턴 ${m[3]}초`],
  [/^(\d+) free skips? left$/, (m) => `무료 패스 ${m[1]}번 남음`],
  [/^(\d+) free pass(?:es)? left$/, (m) => `무료 패스 ${m[1]}번 남음`],
  [/^Own decks · (\d+)$/, (m) => `전용 덱 · ${m[1]}장`],
  [/^(.+): decks$/, (m) => `${nm(m[1])}: 덱`],
  [/^(.+) has no cards: pick some decks for it\.$/, (m) => `${nm(m[1])}에 카드가 없어요. 덱을 골라 주세요.`],
  [/^(.+) uses its own decks: (\d+) cards in play from (.+)\.$/, (m) => `${nm(m[1])} 전용 덱: 카드 ${m[2]}장 (${m[3]}).`],
  [/^(.+) explains in (English|한국어), but its decks have no (?:English|한국어) cards, so it'll get (.+) cards\.$/, (m) =>
    `${nm(m[1])}은(는) ${m[2] === 'English' ? '영어' : '한국어'}로 설명하지만 덱에 그 언어 카드가 없어서 ${m[3].replace('English', '영어')} 카드가 나와요.`],
  [/^Team (\d+)$/, (m) => `${m[1]}팀`],
  [/^Team (\d+):$/, (m) => `${m[1]}팀:`],
  [/^(\d+) teams$/, (m) => `${m[1]}팀`],
  [/^(\d+)s turns$/, (m) => `한 턴 ${m[1]}초`],
  [/^(\d+) seconds$/, (m) => `${m[1]}초`],
  [/^(\d+(?:\.\d+)?) min$/, (m) => `${m[1]}분`],
  [/^(\d+)s$/, (m) => `${m[1]}초`],
  [/^([+−-]?\d+) this turn$/, (m) => `이번 턴 ${m[1]}`],
  [/^(\d+) free skips? per turn, then −1 each$/, (m) => `한 턴에 패스 ${m[1]}번 무료, 그다음 매번 −1`],
  [/^(\d+) free pass(?:es)? per turn, then −1 each$/, (m) => `한 턴에 패스 ${m[1]}번 무료, 그다음 매번 −1`],
  [/^(\d+) English and Korean words, shared by every game\.$/, (m) => `영어·한국어 단어 ${m[1]}개를 모든 게임에서 함께 써요.`],
  [/^Last turn: (.+) ([+−-]?\d+)$/, (m) => `지난 턴: ${nm(m[1])} ${m[2]}`],
  [/^(.+) scored ([+−-]?\d+) last turn$/, (m) => `${nm(m[1])} 지난 턴 ${m[2]}점`],
  [/^(.+) is guessing$/, (m) => `${nm(m[1])} 맞히는 중`],
  [/^(.+) wins!$/, (m) => `${nm(m[1])} 승리!`],
  [/^Add all shown \((\d+)\)$/, (m) => `보이는 단어 모두 추가 (${m[1]})`],
  [/^Selected \((\d+)\)$/, (m) => `선택됨 (${m[1]})`],
  [/^Move (.+) (up|down)$/, (m) => `${nm(m[1])} ${m[2] === 'up' ? '위로' : '아래로'}`],
  [/^(.+) colour: (\w+)\. Change colour$/, (m) => `${nm(m[1])} 색: ${KO[m[2]] || m[2]}. 색 바꾸기`],
  [/^(\w+) \(swap with (.+)\)$/, (m) => `${KO[m[1]] || m[1]} (${nm(m[2])}와 바꾸기)`],
  [/^(.+) explains in$/, (m) => `${nm(m[1])} 설명 언어`],
  [/^Explains in (English|한국어)$/, (m) => `${m[1] === 'English' ? '영어' : '한국어'}로 설명`],
  [/^(Team \d+|.+) name$/, (m) => `${nm(m[1])} 이름`],
  [/^Edit (.+)$/, (m) => `${m[1]} 편집`],
  [/^(.+), but none of the chosen decks are in that language, so they'll get (.+) cards\.$/, (m) =>
    `${m[1].replace(/ explains in English/g, '은(는) 영어로 설명').replace(/ explains in 한국어/g, '은(는) 한국어로 설명')}하지만, 고른 덱에 그 언어가 없어서 ${m[2].replace('English', '영어')} 카드가 나와요.`],
  [/^Imported (\d+) cards, (\d+) decks and (\d+) exclusions\.$/, (m) => `카드 ${m[1]}장, 덱 ${m[2]}개, 제외 ${m[3]}개를 가져왔어요.`],
  [/^Delete "(.+)"\? Cards you wrote for it will be deleted too\.$/, (m) => `"${m[1]}" 덱을 삭제할까요? 직접 쓴 카드도 삭제돼요.`],
  [/^Hand the screen to the explainer\. (.+)$/, (m) => `설명하는 사람에게 화면을 넘기세요. ${tr(m[1]) ?? m[1]}`],
];

/** Korean for one piece of English text, or null if it isn't a menu string. */
export function tr(text) {
  if (Object.prototype.hasOwnProperty.call(KO, text)) return KO[text];
  for (const [re, fn] of PATTERNS) { const m = text.match(re); if (m) return fn(m); }
  // "a · b · c": translate each part
  if (text.includes(' · ')) {
    const parts = text.split(' · ');
    const out = parts.map((p) => tr(p) ?? p);
    if (out.some((p, i) => p !== parts[i])) return out.join(' · ');
  }
  // trailing punctuation or a keyboard hint glued on
  const m = text.match(/^(.*?)([.!:]|\s*\(\d+\))$/);
  if (m && m[1] && KO[m[1]]) return KO[m[1]] + m[2];
  return null;
}

/* ---------------- applying it to the page ---------------- */

// Never translated: card words and taboo lists, book/deck names, team names, things people type.
const SKIP = '.target, .taboo-list, .hs-word, .hs-avoid b, .cv-hs-avoid b, .cv-word, .cv-hs-word, .cm-row b, .scr-words b, .scr-players b, .bw-word, .bw-meta, .rv-word, .set-code, .cm-word, .cm-taboo, .team-name input, input, textarea, [translate="no"], script, style, .uilang';
const ATTRS = ['placeholder', 'title', 'aria-label'];
const origText = new WeakMap(); const shownText = new WeakMap();
const origAttr = new WeakMap();

function doText(node) {
  const el = node.parentElement;
  if (!el || el.closest(SKIP)) return;
  if (!origText.has(node) || node.data !== shownText.get(node)) origText.set(node, node.data);
  const orig = origText.get(node);
  let next = orig;
  if (lang === 'ko') {
    const core = orig.replace(/\s+/g, ' ').trim();
    if (core && /[A-Za-z]/.test(core)) {
      const t = tr(core);
      if (t != null) next = orig.match(/^\s*/)[0] + t + orig.match(/\s*$/)[0];
    }
  }
  shownText.set(node, next);
  if (node.data !== next) node.data = next;
}
function doAttrs(el) {
  if (el.closest(SKIP) && !el.matches('input, textarea')) return;
  let rec = origAttr.get(el);
  for (const a of ATTRS) {
    if (!el.hasAttribute(a)) continue;
    const v = el.getAttribute(a);
    rec ||= {};
    if (!rec[a] || v !== rec[a].shown) rec[a] = { orig: v };
    const t = lang === 'ko' ? tr(rec[a].orig) : null;
    rec[a].shown = t ?? rec[a].orig;
    if (v !== rec[a].shown) el.setAttribute(a, rec[a].shown);
  }
  if (rec) origAttr.set(el, rec);
}
function walk(root) {
  if (root.nodeType === 3) { doText(root); return; }
  if (root.nodeType !== 1) return;
  doAttrs(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let x;
  while ((x = w.nextNode())) { if (x.nodeType === 3) doText(x); else doAttrs(x); }
}

let baseTitle = document.title;
function doTitle() {
  if (document.title !== (doTitle.shown ?? null)) baseTitle = document.title;
  const t = lang === 'ko' ? (tr(baseTitle) ?? baseTitle) : baseTitle;
  doTitle.shown = t;
  if (document.title !== t) document.title = t;
}

let busy = false;
const obs = new MutationObserver((muts) => {
  if (busy) return;
  busy = true;
  for (const m of muts) {
    if (m.type === 'childList') m.addedNodes.forEach(walk);
    else if (m.type === 'characterData') doText(m.target);
    else if (m.type === 'attributes') doAttrs(m.target);
  }
  doTitle();
  obs.takeRecords();
  busy = false;
});

function renderToggle() {
  document.querySelectorAll('.uilang').forEach((el) => {
    el.querySelectorAll('[data-ui]').forEach((b) => b.classList.toggle('on', b.dataset.ui === lang));
  });
}

function apply() {
  document.documentElement.lang = lang;
  busy = true;
  walk(document.body);
  doTitle();
  obs.takeRecords();
  busy = false;
  renderToggle();
  listeners.forEach((fn) => fn(lang));
}

// Wrap pop-ups so their messages are translated too.
for (const name of ['alert', 'confirm', 'prompt']) {
  const orig = window[name].bind(window);
  window[name] = (msg, ...rest) => orig(lang === 'ko' ? (tr(String(msg)) ?? msg) : msg, ...rest);
}

function mountToggle() {
  if (document.querySelector('.uilang')) return; // the page has its own (online.html)
  const html = '<div class="seg uilang" aria-label="Language"><button type="button" data-ui="en">EN</button><button type="button" data-ui="ko">한국어</button></div>';
  const slot = document.querySelector('.topbar-actions');
  if (slot) slot.insertAdjacentHTML('afterbegin', html);
  else document.body.insertAdjacentHTML('afterbegin', `<div class="uilang-float">${html}</div>`);
}

mountToggle();
document.addEventListener('click', (e) => {
  const b = e.target.closest('.uilang [data-ui]');
  if (b) setLang(b.dataset.ui);
});
// another window (e.g. the class view) changed it
window.addEventListener('storage', (e) => { if (e.key === KEY) { const l = read(KEY); if (l && l !== lang) { lang = l; apply(); } } });
obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
new MutationObserver(doTitle).observe(document.querySelector('title') || document.head, { childList: true, subtree: true, characterData: true });
apply();
