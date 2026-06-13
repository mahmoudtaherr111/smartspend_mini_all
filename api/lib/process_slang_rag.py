import json
import sys
import os

# Ensure e:\smartspend_V1_fixed\api\lib is in Python path to import generate_rag
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import generate_rag

allowed_categories = {
    "Food", "Transport", "Groceries", "Bills", "Shopping", 
    "Entertainment", "Health", "Services", "Financial", "Charity"
}

category_map = {
    "telecom": "Bills",
    "electronics": "Shopping",
    "food": "Food",
    "transport": "Transport",
    "groceries": "Groceries",
    "bills": "Bills",
    "shopping": "Shopping",
    "entertainment": "Entertainment",
    "health": "Health",
    "services": "Services",
    "financial": "Financial",
    "charity": "Charity"
}

def map_category(cat):
    c = cat.strip().lower()
    if c in category_map:
        return category_map[c]
    # Fallbacks and inferences
    if any(k in c for k in ["telecom", "internet", "utility", "gas", "electricity", "water", "traffic", "bill"]):
        return "Bills"
    if any(k in c for k in ["electronic", "fashion", "retail", "cosmetic", "toy", "kid", "eyewear", "pet", "furniture"]):
        return "Shopping"
    if any(k in c for k in ["donat", "charity"]):
        return "Charity"
    if any(k in c for k in ["bank", "transfer", "wallet", "app", "installment", "finance"]):
        return "Financial"
    if any(k in c for k in ["ride", "bus", "public transport", "flight"]):
        return "Transport"
    if any(k in c for k in ["restaurant", "cafe", "fast food", "bakery", "dessert", "snack"]):
        return "Food"
    if any(k in c for k in ["pharmacy", "clinic", "hospital", "consultation", "booking", "fitness", "gym", "health"]):
        return "Health"
    if any(k in c for k in ["maintenance", "coworking", "laundry", "tips", "travel agency", "service"]):
        return "Services"
    return "Services"

new_items = [
    # Cairo & Alexandria Local Koshary & Shawarma & Grill Spots
    {"merchant": "Koshary Abou Tarek", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["أبو طارق", "كشري ابو طارق", "كشرى ابو طارق", "ابو طارق"], "isInstallmentCommon": False},
    {"merchant": "Koshary El Tahrir", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["كشري التحرير", "كشرى التحرير", "التحرير"], "isInstallmentCommon": False},
    {"merchant": "Koshary Sayed Hanafy", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["سيد حنفي", "سيد حنفى", "حنفي", "حنفى"], "isInstallmentCommon": False},
    {"merchant": "Koshary Hend", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["كشري هند", "كشرى هند", "هند"], "isInstallmentCommon": False},
    {"merchant": "Koshary Zooba", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["زوبة", "زوبه", "زوبى"], "isInstallmentCommon": False},
    {"merchant": "Koshary El Omda", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["العمدة", "كشري العمدة", "كشرى العمدة", "العمده"], "isInstallmentCommon": False},
    {"merchant": "Koshary Hekaya", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["كشري حكاية", "كشرى حكاية", "حكاية", "حكايه"], "isInstallmentCommon": False},
    {"merchant": "Koshary Karama", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["كشري كرامة", "كشرى كرامة", "كرامة", "كرامه"], "isInstallmentCommon": False},
    {"merchant": "Koshary Goha", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["كشري جحا", "كشرى جحا", "جحا"], "isInstallmentCommon": False},
    {"merchant": "Koshary El Domyati", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["كشري الدمياطي", "كشرى الدمياطى", "الدمياطي"], "isInstallmentCommon": False},
    {"merchant": "Koshary Tom and Basal", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["توم اند بصل", "توم وبصل", "طوم وبصل"], "isInstallmentCommon": False},
    {"merchant": "Koshary Rigo", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["كشري ريجو", "ريجو"], "isInstallmentCommon": False},
    {"merchant": "Koshary El Thawra", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["كشري الثورة", "كشرى الثورة", "الثورة"], "isInstallmentCommon": False},
    {"merchant": "Koshary Abou Ramy", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["كشري ابو رامي", "ابو رامي"], "isInstallmentCommon": False},
    {"merchant": "Koshary Hamada", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["كشري حمادة", "كشرى حماده", "حمادة"], "isInstallmentCommon": False},
    {"merchant": "Koshary El Agamy", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["كشري العجمي", "العجمى"], "isInstallmentCommon": False},
    {"merchant": "Koshary El Safwa", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["كشري الصفوة", "الصفوه"], "isInstallmentCommon": False},
    {"merchant": "Koshary Shaker", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["كشري شاكر", "شاكر"], "isInstallmentCommon": False},
    {"merchant": "Koshary El Zaeem", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["كشري الزعيم", "الزعيم"], "isInstallmentCommon": False},
    {"merchant": "Koshary Asmak", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["كشري اسماك", "أسماك"], "isInstallmentCommon": False},

    {"merchant": "Karam El Sham", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["كرم الشام", "شاورما كرم الشام", "كرم الشام شاورما"], "isInstallmentCommon": False},
    {"merchant": "Abou Haidar", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["ابو حيدر", "شاورما ابو حيدر", "أبو حيدر"], "isInstallmentCommon": False},
    {"merchant": "Abu Anas El Syrian", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["أبو أنس السوري", "ابو انس السوري", "ابو انس"], "isInstallmentCommon": False},
    {"merchant": "Semsema", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["سمسمة", "سمسمه", "شاورما سمسمة"], "isInstallmentCommon": False},
    {"merchant": "Shawarma El Reem", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["شاورما الريم", "الريم"], "isInstallmentCommon": False},
    {"merchant": "Shawarma Shaker", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["شاورما شاكر", "شاكر"], "isInstallmentCommon": False},
    {"merchant": "Abu Mazen El Syrian", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["شاورما ابو مازن", "ابو مازن السوري", "أبو مازن السوري", "ابو مازن"], "isInstallmentCommon": False},
    {"merchant": "Caizo", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["كايزو", "سندوتشات كايزو"], "isInstallmentCommon": False},
    {"merchant": "Semo Shawarma", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["سيمو", "شاورما سيمو"], "isInstallmentCommon": False},
    {"merchant": "Shawarma El Emprator", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["شاورما الامبراطور", "الامبراطور"], "isInstallmentCommon": False},

    {"merchant": "Sobhy Kaber", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["صبحي كابر", "صبحى كابر", "كابر"], "isInstallmentCommon": False},
    {"merchant": "El Prince", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["البرنس", "كبدة البرنس", "كبارى البرنس"], "isInstallmentCommon": False},
    {"merchant": "Qasr El Kababgi", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["قصر الكبابجي", "الكبابجي", "الكبابجى"], "isInstallmentCommon": False},
    {"merchant": "El Menoufy El Kababgi", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["المنوفي", "المنوفى الكبابجي", "كباب المنوفي", "المنوفى"], "isInstallmentCommon": False},
    {"merchant": "El Refaey Kabab", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["الرفاعي", "كباب الرفاعي", "الرفاعى"], "isInstallmentCommon": False},
    {"merchant": "Hosny El Kababgi", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["حسني الكبابجي", "حسنى الكبابجى", "حسني الكبابجى"], "isInstallmentCommon": False},
    {"merchant": "Abou Shakra", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["ابو شقرة", "أبو شقرة", "ابو شقره"], "isInstallmentCommon": False},
    {"merchant": "Hawaoshi El Rabea", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["حواوشي الربيع", "الربيع", "حواوشى الربيع", "حواوشى الربع"], "isInstallmentCommon": False},
    {"merchant": "Wahba El Kababgi", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["وهبة", "وهبه", "كبدة وهبة", "كبده وهبه"], "isInstallmentCommon": False},
    {"merchant": "Kebda El Fallah", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["كبدة الفلاح", "الفلاح", "كبده الفلاح"], "isInstallmentCommon": False},
    {"merchant": "El Haty", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["الحاتي", "الحاتى", "كبابجي الحاتي", "كبابجى الحاتى"], "isInstallmentCommon": False},
    {"merchant": "El Ezba", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["العزبة", "العزبه", "قرية العزبة"], "isInstallmentCommon": False},
    {"merchant": "Balbaa Alexandria", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["بلبع", "مشويات بلبع", "بلبع الاسكندرية"], "isInstallmentCommon": False},
    {"merchant": "Zephyr Sea Food", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["زفير", "سمك زفير", "اسماك زفير"], "isInstallmentCommon": False},
    {"merchant": "Hala'et El Asmak", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["حلقة السمك", "حلقه السمك"], "isInstallmentCommon": False},
    {"merchant": "Aroos El Bahr", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["عروس البحر", "سمك عروس البحر"], "isInstallmentCommon": False},
    {"merchant": "El Domyati Foul", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["الدمياطي", "الدمياطى", "فول الدمياطي"], "isInstallmentCommon": False},
    {"merchant": "El Tabey El Domyati", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["التابعي الدمياطي", "التابعى الدمياطى", "التابعي", "التابعى"], "isInstallmentCommon": False},
    {"merchant": "Gad Restaurant", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["جاد", "مطعم جاد"], "isInstallmentCommon": False},
    {"merchant": "Al Shabrawy", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["الشبراوي", "الشبراوى", "شبراوي", "شبراوى"], "isInstallmentCommon": False},
    {"merchant": "Fattatry El Hoda", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["فطاطري الهدى", "الهدى", "فطيرة الهدى", "الهدى فطير"], "isInstallmentCommon": False},
    {"merchant": "Fattatry El Hosny", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["فطاطري الحسني", "فطاطرى الحسنى", "فطيرة الحسني", "الحسني"], "isInstallmentCommon": False},
    {"merchant": "Fattatry El Nile", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["فطاطري النيل", "فطيرة النيل", "النيل"], "isInstallmentCommon": False},
    {"merchant": "Fattatry Master", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["ماستر فطير", "فطاطري ماستر", "ماستر"], "isInstallmentCommon": False},
    {"merchant": "Dar El Amar", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["دار القمر", "مطعم دار القمر"], "isInstallmentCommon": False},
    {"merchant": "El Garoub", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["الجروب", "فطير الجروب", "جروب"], "isInstallmentCommon": False},
    {"merchant": "Awlad Taqi", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["اولاد تقي", "أولاد تقي", "تقي", "تقى"], "isInstallmentCommon": False},

    # Street Spends & Colloquial Log Terms
    {"merchant": "Street Foul Cart", "category": "Food", "subCategory": "Street Food", "keywords": ["عربية فول", "عربية فول وطعمية", "عربية الفول", "فول الشارع", "فطار وعشا", "فطار وعشاء"], "isInstallmentCommon": False},
    {"merchant": "Baladi Coffee Shop", "category": "Food", "subCategory": "Cafe", "keywords": ["قهوة بلدي", "قهوة بلدى", "القهوة البلدي", "قهوه بلدي", "شاي بلدي", "شاي بلدى", "مشاريب القهوة"], "isInstallmentCommon": False},
    {"merchant": "Local Kiosk", "category": "Groceries", "subCategory": "Kiosk", "keywords": ["كشك أبو علي", "كشك ابو علي", "كشك ابو على", "كشك الشارع", "كشك سجاير", "الكشك", "كشك البركة", "كشك البركه"], "isInstallmentCommon": False},
    {"merchant": "Street Fruit Vendor", "category": "Groceries", "subCategory": "Local Vendor", "keywords": ["بياع فاكهة", "عربية فاكهة", "فاكهاني", "فاكهانى", "فاكهة الشارع"], "isInstallmentCommon": False},
    {"merchant": "Street Vegetable Vendor", "category": "Groceries", "subCategory": "Local Vendor", "keywords": ["بياع خضار", "عربية خضار", "خضري", "خضرى", "خضار الشارع"], "isInstallmentCommon": False},
    {"merchant": "Gas Cylinders Delivery", "category": "Bills", "subCategory": "Utilities", "keywords": ["انبوبة", "أنبوبة", "غاز انبوبة", "بتوجاز", "شحن انبوبة"], "isInstallmentCommon": False},
    {"merchant": "Tuk-Tuk Driver", "category": "Transport", "subCategory": "Micobuses & Taxis", "keywords": ["توكتوك", "توك توك", "تكتك", "اجرة توكتوك", "أجرة توكتوك"], "isInstallmentCommon": False},
    {"merchant": "Microbus Rider", "category": "Transport", "subCategory": "Micobuses & Taxis", "keywords": ["ميكروباص", "مكروباص", "مشروع", "الميكروباص", "اجرة ميكروباص", "أجرة ميكروباص", "اجرة المشروع"], "isInstallmentCommon": False},
    {"merchant": "Baksheesh & Tips", "category": "Services", "subCategory": "Tips", "keywords": ["بقشيش", "تبس", "تيبس", "لله", "نفحة", "بقشيش الدليفري", "بقشيش البواب"], "isInstallmentCommon": False},
    {"merchant": "Street Parking Caretaker", "category": "Services", "subCategory": "Tips", "keywords": ["سايس", "السايس", "ركنة السايس", "منادي", "اركن يا باشا", "فلوس السايس"], "isInstallmentCommon": False},
    {"merchant": "Sundry Expenses / Miscellaneous", "category": "Services", "subCategory": "Miscellaneous", "keywords": ["مصاريف نثريات", "نثريات", "نثريات البيت", "فكة", "فكه", "مصاريف صغيرة"], "isInstallmentCommon": False},
    {"merchant": "Local Baker", "category": "Groceries", "subCategory": "Bread", "keywords": ["فرن بلدي", "فرن عيش", "عيش بلدي", "الطابونة", "عيش فينو", "مخبز بلدي"], "isInstallmentCommon": False},
    {"merchant": "Baladi Butcher", "category": "Groceries", "subCategory": "Meat", "keywords": ["جزار", "جزار بلدي", "الجزار", "لحمة بلدي", "كيلو لحمة"], "isInstallmentCommon": False},
    {"merchant": "Baladi Fishmonger", "category": "Groceries", "subCategory": "Seafood", "keywords": ["فسخاني", "فسخانى", "سماك", "محل سمك", "سمك مشوي", "سمك مقلي"], "isInstallmentCommon": False},
    {"merchant": "Shisha / Tobacco Spot", "category": "Food", "subCategory": "Smoking", "keywords": ["شيشة", "شيشه", "حجر شيشة", "معسل", "معسل قص", "سجاير فرط", "سجائر فرط"], "isInstallmentCommon": False},
    {"merchant": "Local Ironer", "category": "Services", "subCategory": "Laundry", "keywords": ["مكوجي", "مكوجى", "المكوجي", "مكوجي الشارع", "كوي هدوم"], "isInstallmentCommon": False},
    {"merchant": "Local Plumber", "category": "Services", "subCategory": "Maintenance", "keywords": ["سباك", "سباك بلدي", "السباك", "مصنعية سباك"], "isInstallmentCommon": False},
    {"merchant": "Local Carpenter", "category": "Services", "subCategory": "Maintenance", "keywords": ["نجار", "نجار بلدي", "النجار", "تنجيد"], "isInstallmentCommon": False},
    {"merchant": "Local Electrician", "category": "Services", "subCategory": "Maintenance", "keywords": ["كهربائي", "كهربائى", "كهربائي منازل", "تصليح كهربا"], "isInstallmentCommon": False},
    {"merchant": "Porter / Concierge", "category": "Services", "subCategory": "Tips", "keywords": ["البواب", "بواب العمارة", "حارس العقار", "بواب العشيرة", "فلوس البواب"], "isInstallmentCommon": False},
    {"merchant": "Trash Collector", "category": "Services", "subCategory": "Utilities", "keywords": ["زبال", "جامع القمامة", "جامع الزبالة", "فلوس الزبال", "عامل النظافة"], "isInstallmentCommon": False},
    {"merchant": "Local Herbist", "category": "Groceries", "subCategory": "Herbs & Spices", "keywords": ["عطار", "عطارة", "العطار", "توابل", "بخور"], "isInstallmentCommon": False},
    {"merchant": "Local Dairy Shop", "category": "Groceries", "subCategory": "Dairy", "keywords": ["لبان", "محل لبان", "اللبان", "جبنة قديمة", "كيلو لبن", "زبادي بلدي"], "isInstallmentCommon": False},
    {"merchant": "Baladi Roastery", "category": "Food", "subCategory": "Snacks", "keywords": ["مقلة", "مقله", "مقلة لب", "محمصات", "لب وسوداني", "سوداني", "لب سوبر"], "isInstallmentCommon": False},
    {"merchant": "Chicken Vendor", "category": "Groceries", "subCategory": "Poultry", "keywords": ["فرارجي", "فرارجى", "محل فراخ", "الفراخ", "تنظيف فراخ"], "isInstallmentCommon": False},
    {"merchant": "Local Pharmacy", "category": "Health", "subCategory": "Pharmacy", "keywords": ["أجزخانة", "اجزاخانة", "صيدلية الشارع", "دكتور صيدلي", "روشتة"], "isInstallmentCommon": False},
    {"merchant": "Home Maintenance Services", "category": "Services", "subCategory": "Maintenance", "keywords": ["صنايعي", "صنايعية", "مصنعية", "شغل صنايعي", "يومية صنايعي"], "isInstallmentCommon": False},
    {"merchant": "Custom Dressmaker / Tailor", "category": "Services", "subCategory": "Personal Care", "keywords": ["ترزي", "ترزى", "الترزي", "تفصيل هدوم", "تصليح لبس"], "isInstallmentCommon": False},
    {"merchant": "Custom Cobbler", "category": "Services", "subCategory": "Personal Care", "keywords": ["صرماتي", "صرماتى", "كندرجي", "تصليح احذية", "خياطة جزمة"], "isInstallmentCommon": False},
    {"merchant": "Public Bath / Hamam", "category": "Services", "subCategory": "Personal Care", "keywords": ["حمام بلدي", "حمام بلدى", "حمام المغربي"], "isInstallmentCommon": False},
    {"merchant": "Street Beverage Cart", "category": "Food", "subCategory": "Street Food", "keywords": ["عصير قصب", "عربية عصير قصب", "تمر هندي", "سوبيا", "خروب", "عصير فريش"], "isInstallmentCommon": False},
    {"merchant": "Liver Sandwiches Cart", "category": "Food", "subCategory": "Street Food", "keywords": ["عربية كبدة", "عربية كبده", "كبدة الشارع", "كبدة كلاب", "سندوتش كبدة"], "isInstallmentCommon": False},
    {"merchant": "Street Sweet Potato Cart", "category": "Food", "subCategory": "Street Food", "keywords": ["عربية بطاطا", "بطاطا مشوية", "بطاطا", "بطاطا بالبشاميل"], "isInstallmentCommon": False},
    {"merchant": "Street Grilled Corn Cart", "category": "Food", "subCategory": "Street Food", "keywords": ["عربية درة", "درة مشوي", "كوز درة", "دره مشوى"], "isInstallmentCommon": False},
    {"merchant": "Local Sweets Shop", "category": "Food", "subCategory": "Dessert", "keywords": ["بسبوسة وهريسة", "هريسة", "حلويات شرقيه", "حلويات شرقية", "شرقي وغربي"], "isInstallmentCommon": False},
    {"merchant": "Local Stationery / Bookshop", "category": "Shopping", "subCategory": "Stationery", "keywords": ["الفجالة", "مكتبة ادوات مدرسية", "الفجاله", "مكتبة الفجالة", "كشكول وقلم"], "isInstallmentCommon": False},
    {"merchant": "Flea Market", "category": "Shopping", "subCategory": "Local Market", "keywords": ["سوق الجمعة", "سوق الجمعه", "الوكالة", "وكالة البلح", "سوق السبت", "البالة"], "isInstallmentCommon": False},
    {"merchant": "Perfume Mixer", "category": "Shopping", "subCategory": "Cosmetics", "keywords": ["تركيب عطور", "محل تركيب برفانات", "زيت عطري", "برفان تركيب"], "isInstallmentCommon": False},
    {"merchant": "Souvenir Shop", "category": "Shopping", "subCategory": "Gifts", "keywords": ["خان الخليلي", "خان الخليلى", "انتيكات", "بازار"], "isInstallmentCommon": False},
    {"merchant": "Street Charity / Donation Box", "category": "Charity", "subCategory": "Donation", "keywords": ["لله", "صدقة جارية", "تبرع للمسجد", "شنطة رمضان", "جمعية خيرية"], "isInstallmentCommon": False},
    {"merchant": "Traditional Midwife / Healer", "category": "Health", "subCategory": "Alternative Medicine", "keywords": ["داية", "دايه", "حجامة", "شيخ معالج", "علاج طبيعي شعبي"], "isInstallmentCommon": False},
    {"merchant": "Traditional Gym", "category": "Health", "subCategory": "Fitness", "keywords": ["جيم شعبي", "جيم شعبى", "صالة حديد", "جيم الحارة"], "isInstallmentCommon": False},
    {"merchant": "Traditional Registry / Ma'zoun", "category": "Services", "subCategory": "Official", "keywords": ["مأذون", "المأذون", "كتب كتاب", "مصاريف المأذون"], "isInstallmentCommon": False},
    {"merchant": "Traditional Upholsterer", "category": "Services", "subCategory": "Maintenance", "keywords": ["منجد", "منجد بلدي", "تنجيد", "منجد مراتب"], "isInstallmentCommon": False},
    {"merchant": "Traditional Sais Fee", "category": "Services", "subCategory": "Tips", "keywords": ["ايتاوة", "إتاوة", "مليم السايس", "اركن يا باشا"], "isInstallmentCommon": False},
    {"merchant": "Water Cart", "category": "Groceries", "subCategory": "Water", "keywords": ["سقا", "شربات", "كولر مياه", "مبرد مياه", "شحن كرت مياه"], "isInstallmentCommon": False},
    {"merchant": "Traditional Cafe", "category": "Food", "subCategory": "Cafe", "keywords": ["قهوة الفيشاوي", "الفيشاوي", "الفيشاوى", "مقهى الفيشاوي"], "isInstallmentCommon": False},
    {"merchant": "Traditional Alexandria Grill", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["مشويات بلدي", "كبابجي الكينج", "كبابجى الكنج"], "isInstallmentCommon": False},

    # Dessert & Cafes Alexandria & Cairo
    {"merchant": "El Malky", "category": "Food", "subCategory": "Dessert", "keywords": ["المالكي", "المالكى", "حلواني المالكي", "رز بلبن المالكي"], "isInstallmentCommon": False},
    {"merchant": "Azza Ice Cream", "category": "Food", "subCategory": "Dessert", "keywords": ["جيلاتي عزة", "جيلاتى عزة", "جيلاتي عزه", "عزة", "جيلاتى عزه"], "isInstallmentCommon": False},
    {"merchant": "Saber Patisserie", "category": "Food", "subCategory": "Dessert", "keywords": ["حلواني صابر", "صابر", "رز بلبن صابر"], "isInstallmentCommon": False},
    {"merchant": "Hassan Abu Ali Kiosk", "category": "Groceries", "subCategory": "Kiosk", "keywords": ["حسن ابو علي", "كشك حسن ابو علي", "كشك حسن ابو على"], "isInstallmentCommon": False},
    {"merchant": "El Baraka Kiosk", "category": "Groceries", "subCategory": "Kiosk", "keywords": ["كشك البركة", "كشك البركه", "كشك بركة"], "isInstallmentCommon": False},

    # Local Alexandria Seafood
    {"merchant": "Abou Ashraf Seafood", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["ابو اشرف", "أبو أشرف", "اسماك ابو اشرف", "سمك ابو اشرف"], "isInstallmentCommon": False},
    {"merchant": "Sea Gull Restaurant", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["سي جول", "سي جول المكس", "مطعم سي جول"], "isInstallmentCommon": False},
    {"merchant": "El Safra Alexandria", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["الصفرة", "الصفره", "مطعم الصفرة"], "isInstallmentCommon": False},
    {"merchant": "Samakmak Alexandria", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["سمكمك", "اسماك سمكمك", "سمكمك الانفوشي"], "isInstallmentCommon": False},
    {"merchant": "Kadoura Seafood", "category": "Food", "subCategory": "Local Restaurant", "keywords": ["قدورة", "اسماك قدورة", "قدوره"], "isInstallmentCommon": False},

    # Cafe & Outings
    {"merchant": "Brown Nose Cafe", "category": "Food", "subCategory": "Cafe", "keywords": ["براون نوز", "براون نوز كافيه"], "isInstallmentCommon": False},
    {"merchant": "3am Mobarez Cafe", "category": "Food", "subCategory": "Cafe", "keywords": ["قهوة عم مبارز", "عم مبارز", "قهوه عم مبارز"], "isInstallmentCommon": False},
    {"merchant": "Retro Cafe", "category": "Food", "subCategory": "Cafe", "keywords": ["ريترو كافيه", "ريترو"], "isInstallmentCommon": False},
    {"merchant": "El Fishawy Cafe", "category": "Food", "subCategory": "Cafe", "keywords": ["الفيشاوي", "كافيه الفيشاوي", "الفيشاوى", "قهوة الفيشاوى"], "isInstallmentCommon": False},
]

merged = {}

# Process base data
base_list = generate_rag.data
for item in base_list:
    m_name = item["merchant"].strip()
    m_key = m_name.lower()
    
    # Map category to allowed categories
    mapped_cat = map_category(item["category"])
    
    # Process keywords to clean and normalize unique items
    clean_kws = []
    seen_kw = set()
    for kw in item.get("keywords", []):
        kw_clean = kw.strip()
        if kw_clean and kw_clean.lower() not in seen_kw:
            seen_kw.add(kw_clean.lower())
            clean_kws.append(kw_clean)
            
    if m_key in merged:
        # Merge keywords
        existing_item = merged[m_key]
        for kw in clean_kws:
            if kw.lower() not in [x.lower() for x in existing_item["keywords"]]:
                existing_item["keywords"].append(kw)
        existing_item["isInstallmentCommon"] = existing_item["isInstallmentCommon"] or item.get("isInstallmentCommon", False)
    else:
        merged[m_key] = {
            "merchant": m_name,
            "category": mapped_cat,
            "subCategory": item.get("subCategory", "General").strip(),
            "keywords": clean_kws,
            "isInstallmentCommon": item.get("isInstallmentCommon", False)
        }

# Process new items
for item in new_items:
    m_name = item["merchant"].strip()
    m_key = m_name.lower()
    
    mapped_cat = map_category(item["category"])
    
    clean_kws = []
    seen_kw = set()
    for kw in item.get("keywords", []):
        kw_clean = kw.strip()
        if kw_clean and kw_clean.lower() not in seen_kw:
            seen_kw.add(kw_clean.lower())
            clean_kws.append(kw_clean)
            
    if m_key in merged:
        existing_item = merged[m_key]
        # Map category if needed
        existing_item["category"] = mapped_cat
        existing_item["subCategory"] = item["subCategory"].strip()
        for kw in clean_kws:
            if kw.lower() not in [x.lower() for x in existing_item["keywords"]]:
                existing_item["keywords"].append(kw)
        existing_item["isInstallmentCommon"] = existing_item["isInstallmentCommon"] or item.get("isInstallmentCommon", False)
    else:
        merged[m_key] = {
            "merchant": m_name,
            "category": mapped_cat,
            "subCategory": item["subCategory"].strip(),
            "keywords": clean_kws,
            "isInstallmentCommon": item.get("isInstallmentCommon", False)
        }

# Convert back to list and check category constraints
final_data = list(merged.values())

for idx, item in enumerate(final_data):
    if item["category"] not in allowed_categories:
        print(f"Warning: Item {item['merchant']} has category {item['category']} which is not allowed! Mapping to Services.")
        item["category"] = "Services"

# Save the final file
output_path = r"e:\smartspend_V1_fixed\api\lib\egypt_slang_local_rag.json"
os.makedirs(os.path.dirname(output_path), exist_ok=True)
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(final_data, f, ensure_ascii=False, indent=2)

print(f"Successfully processed and merged RAG data.")
print(f"Total entries: {len(final_data)}")
