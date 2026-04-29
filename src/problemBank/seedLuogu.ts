import type { SeedProblem } from "./types";

const luoguIdsAndTitles = [
  ["P1205", "[USACO1.2] Transformations"],
  ["P1320", "压缩技术（续集版）"],
  ["P1319", "压缩技术"],
  ["P1789", "【Mc生存】插火把"],
  ["P5732", "【深基5.习7】杨辉三角"],
  ["P5731", "【深基5.习6】蛇形方阵"],
  ["P1428", "小鱼比可爱"],
  ["P1427", "小鱼的数字游戏"],
  ["P5727", "【深基5.例3】冰雹猜想"],
  ["P1047", "[NOIP 2005 普及组] 校门外的树"],
  ["P5728", "【深基5.例5】旗鼓相当的对手"],
  ["P5729", "【深基5.例7】工艺品制作"],
  ["P2550", "[AHOI2001] 彩票摇奖"],
  ["P2615", "[NOIP 2015 提高组] 神奇的幻方"],
  ["P5730", "【深基5.例10】显示屏"],
  ["P1554", "[USACO06DEC] 梦中的统计 Dream Counting B"],
  ["P2141", "[NOIP 2014 普及组] 珠心算测验"],
  ["P1614", "爱与愁的心痛"],
  ["P2911", "[USACO08OCT] Bovine Bones G"],
  ["P1161", "开灯"]
] as const;

export const luoguSeedProblems: SeedProblem[] = luoguIdsAndTitles.map(([id, title]) => ({
  platform: "luogu",
  id,
  title,
  url: `https://www.luogu.com.cn/problem/${id}`,
  source: "user-supplied"
}));
