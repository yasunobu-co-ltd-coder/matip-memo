import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';

import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { writeFile } from 'fs/promises';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        // ファイルを一時保存 (Next.js Edge RuntimeではなくNode.js環境が必要)
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // 一時ファイルパス
        // 拡張子は音声ファイルに適したもの (.webm or .mp4 etc)
        const tempFilePath = path.join(tmpdir(), `upload-${Date.now()}.webm`);
        await writeFile(tempFilePath, buffer);

        // 1. Whisper APIで文字起こし
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(tempFilePath),
            model: 'whisper-1',
        });

        // 一時ファイル削除
        fs.unlinkSync(tempFilePath);

        const text = transcription.text;
        console.log('Transcribed Text:', text);

        // 2. GPTでJSON解析
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o', // または gpt-3.5-turbo
            messages: [
                {
                    role: 'system',
                    content: `
            あなたは優秀な現場秘書です。以下のテキストは現場での会話や独り言の録音です。
            ここから「議事録」を作成するつもりで、以下の情報を抽出しJSON形式で返してください。

            JSON構造:
            {
              "clientName": "string (会社名や担当者名、プロジェクト名)",
              "memo": "string (議事録の本文。決定事項や確認事項を箇条書きなどで整理)",
              "dueDate": "YYYY-MM-DD (期限や次回予定があれば。なければ今日)",
              "importance": "高" | "中" | "低" (デフォルト: 中),
              "urgency": "高" | "中" | "低" (デフォルト: 中),
              "profit": "高" | "中" | "低" (デフォルト: 中),
              "assignmentType": "任せる" | "自分で" (デフォルト: 任せる),
              "assignee": "string (担当者名があれば)"
            }
            
            今日の日付は ${new Date().toISOString().split('T')[0]} です。
            本文(memo)は、ただの書き起こしではなく、要点をまとめた見やすい形式にしてください。
          `
                },
                { role: 'user', content: text }
            ],
            response_format: { type: "json_object" }
        });

        const resultJson = JSON.parse(completion.choices[0].message.content || '{}');

        return NextResponse.json({ text, result: resultJson });

    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json({ error: 'Failed to process audio' }, { status: 500 });
    }
}
