import { TagRule } from "./types.d.ts";

export const INITIAL_TAG_RULES: TagRule[] = [
    {
        name: "轻小说",
        seedKeywords: new Set(["异世界", "转生", "公会", "冒险者", "魔导书", "魔法", "剑士", "魔王", "勇者"]),
        threshold: 0.05
    },
    {
        name: "诡异",
        seedKeywords: new Set(["诡异", "怪谈", "诅咒", "精神病院", "克苏鲁", "SCP", "恐怖", "惊悚", "灵异"]),
        threshold: 0.03
    },
    {
        name: "科幻",
        seedKeywords: new Set(["太空", "飞船", "激光", "人工智能", "机器人", "外星人", "未来", "科技", "星际"]),
        threshold: 0.04
    },
    {
        name: "武侠",
        seedKeywords: new Set(["江湖", "武功", "剑气", "掌门", "秘籍", "武林", "大侠", "少林", "武当"]),
        threshold: 0.04
    },
    {
        name: "都市",
        seedKeywords: new Set(["都市", "职场", "爱情", "校园", "青春", "恋爱", "公司", "白领", "大学生"]),
        threshold: 0.04
    }
];