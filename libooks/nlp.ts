import { NlpManager } from "npm:node-nlp@^4";
import { TagRule, TrainingData } from "./types.d.ts";

export class NLPManager {
    private manager: NlpManager;
    private isTrained: boolean = false;

    constructor() {
        this.manager = new NlpManager({ languages: ["zh"] });
    }

    // 添加训练数据
    async addTrainingData(trainingData: TrainingData[]): Promise<void> {
        for (const data of trainingData) {
            this.manager.addDocument("zh", data.text, data.label);
        }
    }

    // 训练模型
    async train(): Promise<void> {
        console.log("开始训练NLP模型...");
        await this.manager.train();
        this.isTrained = true;
        console.log("模型训练完成！");
    }

    // 保存和加载模型
    async saveModel(path: string = import.meta.dirname + "/model.nlp"): Promise<void> {
        console.log("开始保存NLP模型...", import.meta.dirname + "/model.nlp")
        await this.manager.save(path);
    }

    async loadModel(path: string = import.meta.dirname + "/model.nlp"): Promise<void> {
        console.log("开始加载NLP模型...", import.meta.dirname + "/model.nlp")
        await this.manager.load(path);
        this.isTrained = true;
    }

    // 分类文本
    async classifyText(text: string, minConfidence: number = 0.3): Promise<Array<{ label: string; confidence: number }>> {
        if (!this.isTrained) {
            throw new Error("模型未训练，请先调用 train() 方法");
        }

        const response = await this.manager.process("zh", text);
        return response.classifications
            .filter(cls => cls.score >= minConfidence)
            .map(cls => ({
                label: cls.label,
                confidence: cls.score
            }));
    }

    // 提取关键词（使用node-nlp的NGram功能）
    extractKeywords(text: string, maxKeywords: number = 20): string[] {
        // 简单的关键词提取，可以根据需要增强
        const words = text.split(/[\s\p{P}]+/u)
            .filter(word => word.length > 1 && !this.isStopWord(word))
            .map(word => word.toLowerCase());

        const wordCount = new Map<string, number>();
        words.forEach(word => {
            wordCount.set(word, (wordCount.get(word) || 0) + 1);
        });

        return Array.from(wordCount.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, maxKeywords)
            .map(([word]) => word);
    }

    private isStopWord(word: string): boolean {
        const stopWords = new Set(["的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一", "一个", "这", "那"]);
        return stopWords.has(word) || word.length < 2;
    }

    // 生成训练数据（基于规则自动生成）
    generateTrainingDataFromRules(rules: TagRule[]): TrainingData[] {
        const trainingData: TrainingData[] = [];

        for (const rule of rules) {
            for (const keyword of rule.seedKeywords) {
                // 为每个关键词创建多个训练样本
                trainingData.push({
                    text: `这是一本关于${keyword}的小说`,
                    label: rule.name
                });
                trainingData.push({
                    text: `小说中包含了${keyword}元素`,
                    label: rule.name
                });
                trainingData.push({
                    text: `故事围绕${keyword}展开`,
                    label: rule.name
                });
            }
        }

        return trainingData;
    }
}