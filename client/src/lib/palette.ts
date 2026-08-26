/**
 * 색 팔레트.
 *
 * 밝기(라이트·다크)와 색조(팔레트)는 다른 축이다.
 * 시스템 다크 모드를 따르면서도 색조는 취향대로 고를 수 있어야 해서 둘을 나눴다.
 *
 * 값은 디자인 문서(Herald 레이아웃 재구성)의 6개 시안에서 그대로 가져왔다.
 * 여기가 원본이고 CSS 는 이 표를 옮겨 적은 것이다 — 한쪽만 고치지 않는다.
 *
 * 뒤의 세 벌(forest·terracotta·cobalt)은 라이트 값만 받았고 다크는 앞의 세 벌에서
 * 읽어낸 규칙으로 유도했다 — 다크 배경은 라이트 본문색을 oklch L 19.5% 로 내린 것,
 * 다크 본문색은 라이트 배경을 L −2.5 한 것, 강조는 max(L+5.5, 66%). 자세한 건
 * index.css 옆의 값과 같이 본다.
 */
const STORAGE_KEY = "herald.palette";

export type PaletteId =
  | "charcoal"
  | "mono"
  | "navy"
  | "forest"
  | "terracotta"
  | "cobalt";

export type PaletteInfo = {
  id: PaletteId;
  name: string;
  note: string;
  /** 설정 화면의 미리보기 칩. 라이트 기준 bg · surface · divider · accent */
  swatch: [string, string, string, string];
};

export const PALETTES: PaletteInfo[] = [
  {
    id: "charcoal",
    name: "Charcoal & Vermilion",
    note: "따뜻한 아이보리 바탕에 볏 색을 포인트로만 써요",
    swatch: ["#F7F5F0", "#FFFFFF", "#E3E0D8", "#D94A3A"],
  },
  {
    id: "mono",
    name: "Monotone",
    note: "색은 쓰지 않고 명도만으로 강조해요. 로고와 가장 잘 붙죠",
    swatch: ["#F5F5F5", "#FFFFFF", "#D8D8D8", "#3A3A3A"],
  },
  {
    id: "navy",
    name: "Navy & Cream",
    note: "짙은 네이비에 금빛 강조. 밤에 보기 편해요",
    swatch: ["#F8F5ED", "#FFFFFF", "#E6E0D0", "#C89B3C"],
  },
  {
    id: "forest",
    name: "Forest",
    note: "옅은 회녹색 바탕에 세이지 그린을 포인트로만 써요",
    swatch: ["#F4F3ED", "#FFFFFF", "#DDE0D9", "#718C5A"],
  },
  {
    id: "terracotta",
    name: "Terracotta",
    note: "따뜻한 베이지 바탕에 테라코타 한 점. 오래 봐도 눈이 편해요",
    swatch: ["#F5EFE7", "#FFFCF8", "#E4D9CD", "#C96B4B"],
  },
  {
    id: "cobalt",
    name: "Cobalt",
    note: "차가운 무채색에 강렬한 코발트 블루. 여섯 중 대비가 가장 셉니다",
    swatch: ["#F6F7F9", "#FFFFFF", "#DEE1E7", "#4267D5"],
  },
];

export const DEFAULT_PALETTE: PaletteId = "charcoal";

export function loadPalette(): PaletteId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (PALETTES.some((palette) => palette.id === raw)) return raw as PaletteId;
  } catch {
    // 시크릿 창·저장소 차단
  }
  return DEFAULT_PALETTE;
}

export function savePalette(palette: PaletteId): void {
  try {
    localStorage.setItem(STORAGE_KEY, palette);
  } catch {
    // 저장이 막혀도 이번 세션은 굴러가야 한다.
  }
}

export function applyPalette(palette: PaletteId): void {
  document.documentElement.dataset.palette = palette;
}
