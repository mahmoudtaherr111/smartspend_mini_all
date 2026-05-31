import fs from 'fs';
import path from 'path';

// صيغة الداتا المطلوبة لـ Gemini: {"text_input": "...", "output": "..."}
const dataset = [];

function addExample(input, outputObj) {
    dataset.push({
        // لازم المدخل يكون مطابق تماماً للـ Prompt اللي بتبعته في الـ Pipeline
        text_input: `النص:\n${input}`,
        output: JSON.stringify(outputObj)
    });
}

// 1. المصاريف العادية المباشرة
addExample("دفعت 200 جنيه للسباك", {
    decomposed_sentences: ["دفعت 200 جنيه للسباك"],
    items: [{
        type: "expense", amount: 200, main_category: "سكن", sub_category: "صيانة",
        item_name: "مصنعية سباك", confidence: 95, alertMessage: "ok",
        needsClarification: false, clarificationQuestion: null,
        person_mentioned: null, person_relationship: null, is_valid_transaction: true
    }]
});

// 2. مصطلحات شعبية (جمعية)
addExample("دفعت قسط الجمعية 5000", {
    decomposed_sentences: ["دفعت قسط الجمعية 5000"],
    items: [{
        type: "expense", amount: 5000, main_category: "التزامات وجمعيات", sub_category: "قسط جمعية",
        item_name: "قسط الجمعية", confidence: 95, alertMessage: "ok",
        needsClarification: false, clarificationQuestion: null,
        person_mentioned: null, person_relationship: null, is_valid_transaction: true
    }]
});

addExample("قبضت الجمعية 20000", {
    decomposed_sentences: ["قبضت الجمعية 20000"],
    items: [{
        type: "income", amount: 20000, main_category: "التزامات وجمعيات", sub_category: "قبض جمعية",
        item_name: "قبض الجمعية", confidence: 95, alertMessage: "ok",
        needsClarification: false, clarificationQuestion: null,
        person_mentioned: null, person_relationship: null, is_valid_transaction: true
    }]
});

// 3. أشخاص وعلاقات (نستخرج الاسم فقط ونسيب الكود يقرر العلاقة)
addExample("حولت 1000 جنيه لمروان", {
    decomposed_sentences: ["حولت 1000 جنيه لمروان"],
    items: [{
        type: "transfer", amount: 1000, main_category: "تحويل", sub_category: "تحويل كاش",
        item_name: "تحويل لمروان", confidence: 90, alertMessage: "ok",
        needsClarification: false, clarificationQuestion: null,
        person_mentioned: "مروان", person_relationship: null, is_valid_transaction: true
    }]
});

addExample("اديت صاحبي احمد 300 سلف", {
    decomposed_sentences: ["اديت صاحبي احمد 300 سلف"],
    items: [{
        type: "transfer", amount: 300, main_category: "تحويل", sub_category: "دين/سلفة",
        item_name: "سلفة لاحمد", confidence: 90, alertMessage: "ok",
        needsClarification: false, clarificationQuestion: null,
        person_mentioned: "احمد", person_relationship: "صديق", is_valid_transaction: true
    }]
});

// 4. العمليات المتعددة في رسالة واحدة
addExample("جبت كوتشي ب 800 ودفعت 50 للسايس", {
    decomposed_sentences: ["جبت كوتشي ب 800", "ودفعت 50 للسايس"],
    items: [
        {
            type: "expense", amount: 800, main_category: "تسوق", sub_category: "أحذية",
            item_name: "كوتشي", confidence: 95, alertMessage: "ok",
            needsClarification: false, clarificationQuestion: null,
            person_mentioned: null, person_relationship: null, is_valid_transaction: true
        },
        {
            type: "expense", amount: 50, main_category: "خدمات سيارات", sub_category: "ركنة",
            item_name: "سايس", confidence: 95, alertMessage: "ok",
            needsClarification: false, clarificationQuestion: null,
            person_mentioned: null, person_relationship: null, is_valid_transaction: true
        }
    ]
});

// 5. مصطلحات صعبة (سبوبة / فاليو)
addExample("جالي 1500 من سبوبة الديزاين", {
    decomposed_sentences: ["جالي 1500 من سبوبة الديزاين"],
    items: [{
        type: "income", amount: 1500, main_category: "عمل حر", sub_category: "سبوبة",
        item_name: "ديزاين", confidence: 95, alertMessage: "ok",
        needsClarification: false, clarificationQuestion: null,
        person_mentioned: null, person_relationship: null, is_valid_transaction: true
    }]
});

addExample("دفعت 400 قسط فاليو", {
    decomposed_sentences: ["دفعت 400 قسط فاليو"],
    items: [{
        type: "expense", amount: 400, main_category: "التزامات وجمعيات", sub_category: "أقساط شركات",
        item_name: "قسط فاليو", confidence: 95, alertMessage: "ok",
        needsClarification: false, clarificationQuestion: null,
        person_mentioned: null, person_relationship: null, is_valid_transaction: true
    }]
});

// حفظ الملف بصيغة JSONL
const outPath = path.join(process.cwd(), 'smartspend_dataset.jsonl');
const fileStream = fs.createWriteStream(outPath);

dataset.forEach(record => {
    fileStream.write(JSON.stringify(record) + '\n');
});

fileStream.end();
console.log(`✅ تم إنشاء ملف التدريب بنجاح: ${outPath}`);
console.log(`عدد الأمثلة: ${dataset.length}`);
