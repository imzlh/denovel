export interface BookFile {
    path: string;
    name: string;
    size: number;
    content: string;
}

export class Guesser {
    // 专注于标题中常见词汇的映射表
    // 豆包生成
    static categoryKeywords: Record<string, string[]> = {
        '轻小说': ['废萌', '弱气', '恶役', '魔王', '龙', '精灵', '幻想'],
        '诡异': ['诡异', '怪诞', '离奇', '诡谲', '怪谈', '诡事'],
        '科幻': ['科幻', '未来', '太空', '宇宙', '星际', 'AI', '机器人', '量子', '赛博'],
        '武侠': ['武侠', '江湖', '武功', '内力', '门派', '侠客', '剑客', '秘籍'],
        '都市': ['都市', '城市', '现代', '都市之', '都市里'],
        '历史': ['历史', '古代', '唐朝', '宋朝', '明朝', '清朝', '三国', '楚汉'],
        '仙侠': ['仙侠', '修仙', '修真', '仙缘', '仙界', '法术', '飞剑', '渡劫'],
        '恋爱': ['恋爱', '爱情', '言情', '爱恋', '情缘', '情侣'],
        '穿越': ['穿越', '魂穿', '身穿', '异世', '回到'],
        '体育': ['体育', '篮球', '足球', '排球', '网球', '田径', '竞技'],
        '电竞': ['电竞', 'LOL', '英雄联盟', '王者荣耀', '吃鸡', '绝地求生'],
        '职场': ['职场', '办公室', '上班', '工作'],
        '军事': ['军事', '军队', '战争', '士兵', '军营', '特种兵'],
        '悬疑': ['悬疑', '谜团', '悬念', '疑案', '未解之谜'],
        '奇幻': ['奇幻', '魔法', '异世界', '奇幻大陆'],
        '恐怖': ['恐怖', '惊悚', '鬼怪', '幽灵', '毛骨悚然'],
        '推理': ['推理', '侦探', '破案', '解谜', '案件'],
        '校园': ['校园', '学校', '学生', '同学'],
        '青春': ['青春', '少年', '少女', '青春期'],
        '传记': ['传记', '自传', '生平', '回忆录'],
        '玄幻': ['玄幻', '玄奇', '玄幻世界'],
        '魔幻': ['魔幻', '魔界', '魔法大陆'],
        '游戏': ['游戏', '网游', '手游', '虚拟游戏'],
        '末世': ['末世', '末日', '灾后'],
        '重生': ['重生', '重活', '再活', '轮回'],
        '系统': ['系统', '金手指', '系统流', '开挂'],
        '江湖': ['江湖', '侠客', '门派'],
        '灵异': ['灵异', '超自然', '灵异事件'],
        '搞笑': ['搞笑', '幽默', '喜剧', '爆笑'],
        '励志': ['励志', '奋斗', '努力', '梦想'],
        '犯罪': ['犯罪', '刑侦', '罪犯'],
        '冒险': ['冒险', '探险', '旅程'],
        '娱乐': ['华娱'],
        '综漫': ['综漫', '斗罗', '柯南', '战锤', '幻想乡', '星穹铁道'],
        '其他': []
    };

    // Deepseek生成
    static GENRE_KEYWORDS: Record<string, string[]> = {
        // 动漫相关
        '综漫': ['综漫', '斗罗', '柯南', '战锤', '幻想乡', '星穹铁道', '火影', '海贼', '死神', 'fate', '型月', '从零开始', 'mygo'],
        '轻小说': ['废萌', '弱气', '恶役', '魔王', '龙', '精灵', '幻想', '转生', '异世界', '冒险者', '公会', '魔法学院', '技能', '状态栏'],

        // 奇幻玄幻
        '西方奇幻': ['骑士', '魔法', '巫师', '精灵', '矮人', '巨龙', '圣剑', '魔王城', '佣兵', '吸血鬼', '狼人', '圣光'],
        '东方玄幻': ['修仙', '修真', '金丹', '元婴', '渡劫', '飞升', '灵气', '法宝', '剑气', '仙尊', '天庭', '魔道', '正道'],
        '武侠': ['江湖', '武功', '内力', '剑气', '掌门', '秘籍', '武林', '大侠', '少林', '武当', '峨眉', '华山', '轻功'],

        // 科幻
        '硬科幻': ['太空', '飞船', '激光', '人工智能', '机器人', '外星人', '未来', '科技', '星际', '曲速', '量子', '纳米', '克隆'],
        '软科幻': ['时间旅行', '平行世界', '虚拟现实', '意识上传', '赛博朋克', ' Cyberpunk', '仿生人', '神经连接'],
        '太空歌剧': ['帝国', '联邦', '舰队', '星际战争', '殖民星球', '外星文明', '超空间', '星门'],

        // 悬疑惊悚
        '诡异': ['诡异', '怪谈', '诅咒', '精神病院', '克苏鲁', 'SCP', '恐怖', '惊悚', '灵异', '邪神', '古神', 'san值', '收容'],
        '侦探推理': ['谋杀', '侦探', '推理', '谜题', '线索', '嫌疑人', '不在场证明', '密室', '凶手', '真相'],
        '犯罪黑帮': ['黑帮', '犯罪', '毒品', '枪战', '卧底', '警察', '杀手', '走私', '洗钱', '地下世界'],

        // 现实题材
        '都市': ['都市', '职场', '爱情', '校园', '青春', '恋爱', '公司', '白领', '大学生', '公寓', '地铁', '咖啡厅'],
        '历史': ['历史', '古代', '王朝', '皇帝', '将军', '战争', '谋略', '宫廷', '穿越历史', '改变历史', '三国', '唐朝', '宋朝'],
        '军事': ['军事', '战争', '士兵', '指挥官', '战术', '战略', '坦克', '战机', '军舰', '特种部队', '间谍', '情报'],
        '年代': ['四合院', '19', '200'],

        // 特殊题材
        '体育竞技': ['体育', '篮球', '足球', '网球', '游泳', '奥运会', '冠军', '训练', '比赛', '运动员', '教练', 'NBA'],
        '美食': ['美食', '厨师', '料理', '烹饪', '食谱', '食材', '餐馆', '美味', '舌尖', '烘焙', '小吃'],
        '游戏': ['游戏', '玩家', '副本', 'BOSS', '装备', '等级', '技能', '公会', 'PVP', '电竞', '全息', 'VR', 'LOL'],

        // 情感类型
        '恋爱': ['恋爱', '爱情', '告白', '约会', '分手', '初恋', '暗恋', '情侣', '婚姻', '求婚', '吃醋', '三角恋'],
        '治愈': ['治愈', '温馨', '温暖', '感动', '友情', '亲情', '成长', '救赎', '希望', '阳光', '微笑'],
        '悲剧': ['悲剧', '死亡', '离别', '痛苦', '绝望', '牺牲', '眼泪', '悲伤', '虐心', '遗憾', '命运'],

        // 风格类型
        '搞笑': ['搞笑', '幽默', '吐槽', '逗比', '沙雕', '欢乐', '爆笑', '无厘头', '恶搞', '段子'],
        '热血': ['热血', '战斗', '激情', '信念', '伙伴', '梦想', '胜利', '不屈', '斗志', '爆发'],
        '黑暗': ['黑暗', '残酷', '人性', '背叛', '阴谋', '权力', '欲望', '堕落', '毁灭', '复仇'],
    }

    /**
     * 针对标题优化的小说分类函数
     * 专注于标题中高频出现的关键词
     */
    static classifyNovelByTitle(title: string) {
        const processedTitle = title.toLowerCase().replace(/[^\w\s]/gi, '');
        const matchCounts: Record<string, number> = {};

        // 初始化匹配计数
        (Object.keys(this.categoryKeywords) as string[]).forEach(category => {
            matchCounts[category] = 0;
        });

        // 匹配逻辑：更注重完整词和标题常见组合
        (Object.keys(this.categoryKeywords) as string[]).forEach(category => {
            const keywords = this.categoryKeywords[category];

            keywords.forEach(keyword => {
                const lowerKeyword = keyword.toLowerCase();
                // 标题中常见的两种模式：关键词在前或在后
                if (processedTitle.includes(lowerKeyword) ||
                    processedTitle.includes(`${lowerKeyword}之`) ||
                    processedTitle.includes(`之${lowerKeyword}`)) {
                    matchCounts[category]++;
                }
            });
        });

        // 确定最佳匹配
        let maxCount = -1;
        let bestCategory: string = '其他';

        (Object.keys(matchCounts) as string[]).forEach(category => {
            if (category === '其他') return;
            if (matchCounts[category] > maxCount) {
                maxCount = matchCounts[category];
                bestCategory = category;
            }
        });

        return maxCount > 0 ? [bestCategory] : [];
    }

    // 从文件名猜测可能的标签
    static guessTagsFromFilename(filename: string): string[] {
        // const guesses: string[] = [];
        // const lowerName = filename.toLowerCase();

        // if (lowerName.includes('诡异') || lowerName.includes('恐怖') || lowerName.includes('怪谈')) {
        //     guesses.push('诡异');
        // }
        // if (lowerName.includes('轻小说') || lowerName.includes('异世界') || lowerName.includes('转生')) {
        //     guesses.push('轻小说');
        // }
        // if (lowerName.includes('科幻') || lowerName.includes('太空') || lowerName.includes('星际')) {
        //     guesses.push('科幻');
        // }
        // if (lowerName.includes('武侠') || lowerName.includes('江湖') || lowerName.includes('武功')) {
        //     guesses.push('武侠');
        // }
        // if (lowerName.includes('都市') || lowerName.includes('职场') || lowerName.includes('爱情')) {
        //     guesses.push('都市');
        // }]

        // from DeepSeek generated
        const guesses: string[] = [];
        const lowerName = filename.toLowerCase();

        for(const [k, v] of Object.entries(this.GENRE_KEYWORDS)){
            if(v.some(keyword => lowerName.includes(keyword))){
                guesses.push(k);
            }
        }

        if(guesses.length) return guesses;
        return this.classifyNovelByTitle(filename);

        // return guesses;
    }
}