/**
 * 下载蓝奏云盘
 */

import { fetch2, getDocument } from "./main.ts";

interface AjaxData {
    [key: string]: string | number | boolean;
}

interface LanZouFile {
    icon: string;
    t: number;
    id: string;
    name_all: string;
    size: string;
    time: string;
    duan: string;
    p_ico: number;
}

export function parseDynamicAjax(code: string): AjaxData {
    // 提取所有变量和值
    const variables = extractVariables(code);

    // 提取AJAX data对象内容
    const dataContent = extractDataContent(code);

    // 解析data对象
    return parseDataObject(dataContent, variables);
}

// 提取变量声明和赋值
function extractVariables(code: string): Record<string, any> {
    const vars: Record<string, any> = {};

    // 匹配 var variable = 'value' 格式
    const varDeclarations = code.matchAll(/var\s+(\w+)\s*=\s*'([^']+)'/g);
    for (const match of varDeclarations) {
        vars[match[1]] = match[2];
    }

    // 匹配 variable = value 格式的后续赋值
    const assignments = code.matchAll(/(?:^|\n)\s*(\w+)\s*=\s*([^;]+);/g);
    for (const match of assignments) {
        const value = parseDynamicValue(match[2].trim(), vars);
        if (value !== undefined) {
            vars[match[1]] = value;
        }
    }

    return vars;
}

// 提取AJAX请求中的data对象
function extractDataContent(code: string): string {
    const dataMatch = code.match(/data\s*:\s*{([\s\S]*?)},?\n/);
    return dataMatch ? dataMatch[1] : '';
}

// 解析data对象内容
function parseDataObject(content: string, variables: Record<string, any>): AjaxData {
    const data: AjaxData = {};

    // 匹配键值对
    const entries = content.matchAll(/(['"]?)(\w+)\1\s*:\s*([^,\n]+)/g);
    for (const match of entries) {
        const key = match[2];
        const rawValue = match[3].trim();
        data[key] = parseDynamicValue(rawValue, variables);
    }

    return data;
}

// 动态值解析器
function parseDynamicValue(rawValue: string, variables: Record<string, any>): any {
    // 处理数字
    if (/^\d+$/.test(rawValue)) return parseInt(rawValue);

    // 处理字符串
    if (rawValue.startsWith("'") || rawValue.startsWith('"')) {
        return rawValue.slice(1, -1);
    }

    // 处理变量引用
    if (rawValue in variables) {
        return variables[rawValue];
    }

    // 处理布尔值
    if (rawValue === 'true') return true;
    if (rawValue === 'false') return false;

    // 返回原始值（处理未定义的变量）
    return rawValue;
}

const getFiles = async function(page: string) {
    const doc = await getDocument(page);
    const script = doc.getElementsByTagName('script').find(s => 
        s.innerHTML.includes('document.title = ')
    );
    if (!script) {
        throw new Error('找不到script部分，确保这是蓝奏云分享链接！');
    }

    const data = parseDynamicAjax(script.innerHTML);
    const formData = new FormData();
    for (const [key, value] of Object.entries(data)) {
        formData.append(key, String(value));
    }

    const files:LanZouFile[] = [];
    let pgnum = 1;
    let lastNum = 50;   // 每页显示50个文件
    while(lastNum == 50){
        formData.set('pg', pgnum.toString());
        const list = await fetch2(`https://wwpe.lanzoub.com/filemoreajax.php?file=${data.fid}`, {
            method: 'POST',
            body: formData
        }).then(r => r.json());
        lastNum = list.length;
        pgnum++;
        if(list.info != 'success') throw new Error('获取文件列表失败！');
        files.push(...list.text);
    }

    return files;
}

const RESOLVE_LINK = 'https://developer-oss.lanrar.com/file/?';
const getLink = async function(file: LanZouFile) {
    

if(import.meta.main){
    const link = prompt('请输入蓝奏云分享链接：');
    if(!link) return;
    const files = await getFiles(link);
    console.log(files);

    for(const file of files)
}