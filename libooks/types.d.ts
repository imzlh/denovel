export interface Book {
    id: string;
    title: string;
    author: string;
    description: string;
    content: string;
    filePath: string;
    tags: string[];
    confidence: Record<string, number>; // 每个标签的置信度
    processedAt: Date;
    metadata: Record<string, any>;
}

export interface TagRule {
    name: string;
    seedKeywords: string[] | Set<string>;
    threshold: number;
}

export interface SearchFilters {
    query?: string;
    tags?: string[];
    author?: string;
    title?: string;
    limit?: number;
    offset?: number;
    minConfidence?: number;
}

export interface TrainingData {
    text: string;
    label: string;
}