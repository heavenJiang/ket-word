import type { Topic } from "../types";

/**
 * The order of the Think course (Cambridge, 2nd edition): Starter (A1), Think 1 (A2, the KET level),
 * Think 2 (B1). Each unit lists the islands for its vocabulary topics, plus the core-word island that
 * fits its grammar (to be and question words → 我和你). An island is learnt at its first unit; a later
 * unit on the same topic has nothing new and shows as learnt already. The books' own word lists are not
 * public, so units are matched by topic: an island is usually bigger than a unit's word list.
 * Unit topics come from the books' contents pages; the 2nd edition keeps the 1st edition's topics in
 * the same order under new unit titles.
 */
export interface RouteStep {
  book: "Think Starter" | "Think 1" | "Think 2";
  unit: string;
  /** The unit's vocabulary topics, in Chinese. */
  zh: string;
  islands: string[];
}

export const ROUTE: RouteStep[] = [
  { book: "Think Starter", unit: "Welcome", zh: "字母、颜色、教室用品、数字、问候", islands: ["colours", "numbers", "school", "core-hello", "core-little"] },
  { book: "Think Starter", unit: "1", zh: "国家和国籍、形容词", islands: ["world", "core-me", "core-describe"] },
  { book: "Think Starter", unit: "2", zh: "描述感受", islands: ["feelings", "core-feel"] },
  { book: "Think Starter", unit: "3", zh: "家人、房子和家具", islands: ["family", "home"] },
  { book: "Think Starter", unit: "4", zh: "城市里的地方、方位、价格", islands: ["town", "buildings", "core-where", "shopping"] },
  { book: "Think Starter", unit: "5", zh: "业余活动、电子产品", islands: ["hobbies", "tech", "core-when"] },
  { book: "Think Starter", unit: "6", zh: "身体部位、描述人", islands: ["health", "core-people"] },
  { book: "Think Starter", unit: "7", zh: "运动、时间、月份和季节", islands: ["sport", "time", "core-can"] },
  { book: "Think Starter", unit: "8", zh: "衣服、音乐", islands: ["clothes", "media", "core-fun"] },
  { book: "Think Starter", unit: "9", zh: "食物饮料、三餐", islands: ["food", "core-give"] },
  { book: "Think Starter", unit: "10", zh: "天气、过去的时间", islands: ["weather"] },
  { book: "Think Starter", unit: "11", zh: "动物", islands: ["animals", "core-nature"] },
  { book: "Think Starter", unit: "12", zh: "交通、地理名称", islands: ["travel", "nature", "countryside", "core-places"] },
  { book: "Think 1", unit: "Welcome", zh: "个人信息、日期、我的东西", islands: ["documents", "core-things"] },
  { book: "Think 1", unit: "1", zh: "爱好", islands: [] },
  { book: "Think 1", unit: "2", zh: "商店、花钱", islands: ["core-howmuch"] },
  { book: "Think 1", unit: "3", zh: "食物饮料", islands: [] },
  { book: "Think 1", unit: "4", zh: "家人、感受", islands: [] },
  { book: "Think 1", unit: "5", zh: "房子和家具", islands: ["appliances"] },
  { book: "Think 1", unit: "6", zh: "朋友、性格", islands: [] },
  { book: "Think 1", unit: "7", zh: "电子产品、家务", islands: ["core-do"] },
  { book: "Think 1", unit: "8", zh: "运动和运动动词", islands: ["core-move"] },
  { book: "Think 1", unit: "9", zh: "地理、天气", islands: [] },
  { book: "Think 1", unit: "10", zh: "城里的地方和设施", islands: ["services"] },
  { book: "Think 1", unit: "11", zh: "身体、预测将来", islands: ["core-think"] },
  { book: "Think 1", unit: "12", zh: "交通和旅行", islands: [] },
  { book: "Think 2", unit: "1–3", zh: "性格、学校科目、电影电视", islands: [] },
  { book: "Think 2", unit: "4", zh: "网络、不定代词", islands: ["core-words", "core-anyone"] },
  { book: "Think 2", unit: "5–7", zh: "音乐、环境、聚会", islands: [] },
  { book: "Think 2", unit: "8", zh: "方向和移动、科学", islands: ["measure"] },
  { book: "Think 2", unit: "9", zh: "职业", islands: ["jobs"] },
  { book: "Think 2", unit: "10–12", zh: "健康、新闻、规则", islands: [] },
];

/** Every open island in route order; islands the route leaves out (none today) follow in map order. */
export function routeOrder(topics: Topic[]): string[] {
  const open = topics.filter((t) => t.ready).map((t) => t.id);
  const inRoute = ROUTE.flatMap((s) => s.islands).filter((id) => open.includes(id));
  return [...new Set([...inRoute, ...open])];
}

/** Where an island sits in the course, e.g. "Think Starter · Unit 3". */
export function unitOf(island: string): RouteStep | undefined {
  return ROUTE.find((s) => s.islands.includes(island));
}

export const unitLabel = (s: RouteStep) => `${s.book} · ${s.unit === "Welcome" ? "Welcome" : `Unit ${s.unit}`}`;
