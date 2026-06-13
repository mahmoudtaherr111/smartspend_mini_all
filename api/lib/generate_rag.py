import json
import os

data = [
    # Telecom & Internet
    {"merchant": "WE", "category": "Telecom", "subCategory": "Mobile & Internet", "keywords": ["وي", "المصرية للاتصالات", "Telecom Egypt", "TE Data", "تي داتا"], "isInstallmentCommon": False},
    {"merchant": "Vodafone", "category": "Telecom", "subCategory": "Mobile & Internet", "keywords": ["فودافون", "فوادفون", "ڤودافون"], "isInstallmentCommon": False},
    {"merchant": "Etisalat", "category": "Telecom", "subCategory": "Mobile & Internet", "keywords": ["اتصالات", "اتصلات"], "isInstallmentCommon": False},
    {"merchant": "Orange", "category": "Telecom", "subCategory": "Mobile & Internet", "keywords": ["اورانج", "اورنج", "موبينيل", "Mobinil"], "isInstallmentCommon": False},
    {"merchant": "NOOR", "category": "Telecom", "subCategory": "Internet", "keywords": ["نور", "نور للانترنت", "Noor ADSL"], "isInstallmentCommon": False},

    # Ride-Hailing & Transport
    {"merchant": "Uber", "category": "Transport", "subCategory": "Ride-Hailing", "keywords": ["اوبر", "أوبر"], "isInstallmentCommon": False},
    {"merchant": "Careem", "category": "Transport", "subCategory": "Ride-Hailing", "keywords": ["كريم"], "isInstallmentCommon": False},
    {"merchant": "inDrive", "category": "Transport", "subCategory": "Ride-Hailing", "keywords": ["ان درايف", "اندرايف", "In driver"], "isInstallmentCommon": False},
    {"merchant": "DiDi", "category": "Transport", "subCategory": "Ride-Hailing", "keywords": ["ديدي"], "isInstallmentCommon": False},
    {"merchant": "Swvl", "category": "Transport", "subCategory": "Bus", "keywords": ["سويفل", "سوفل"], "isInstallmentCommon": False},
    {"merchant": "GoBus", "category": "Transport", "subCategory": "Bus", "keywords": ["جو باص", "جوباص", "Go Bus"], "isInstallmentCommon": False},
    {"merchant": "Cairo Metro", "category": "Transport", "subCategory": "Public Transport", "keywords": ["مترو", "المترو", "مترو الانفاق"], "isInstallmentCommon": False},
    {"merchant": "Buseet", "category": "Transport", "subCategory": "Bus", "keywords": ["بسيط", "بصيط"], "isInstallmentCommon": False},
    {"merchant": "Super Jet", "category": "Transport", "subCategory": "Bus", "keywords": ["سوبر جيت", "سوبرجيت"], "isInstallmentCommon": False},
    {"merchant": "Blue Bus", "category": "Transport", "subCategory": "Bus", "keywords": ["بلو باص", "بلوباص"], "isInstallmentCommon": False},
    {"merchant": "East Delta", "category": "Transport", "subCategory": "Bus", "keywords": ["شرق الدلتا", "الشرق للدلتا"], "isInstallmentCommon": False},
    {"merchant": "EgyBus", "category": "Transport", "subCategory": "Bus", "keywords": ["ايجي باص", "إيجي باص"], "isInstallmentCommon": False},

    # Delivery & Groceries
    {"merchant": "Talabat", "category": "Food", "subCategory": "Delivery", "keywords": ["طلبات", "اطلب", "Otlob"], "isInstallmentCommon": False},
    {"merchant": "InstaShop", "category": "Groceries", "subCategory": "Delivery", "keywords": ["انستاشوب", "انستا شوب"], "isInstallmentCommon": False},
    {"merchant": "Breadfast", "category": "Groceries", "subCategory": "Delivery", "keywords": ["بريدفاست", "بريد فاست", "بريد فست"], "isInstallmentCommon": False},
    {"merchant": "Rabbit", "category": "Groceries", "subCategory": "Delivery", "keywords": ["رابيت", "رابت"], "isInstallmentCommon": False},
    {"merchant": "Carrefour", "category": "Groceries", "subCategory": "Supermarket", "keywords": ["كارفور", "كرفور"], "isInstallmentCommon": True},
    {"merchant": "Spinneys", "category": "Groceries", "subCategory": "Supermarket", "keywords": ["سبينيس", "سبينس"], "isInstallmentCommon": False},
    {"merchant": "Seoudi", "category": "Groceries", "subCategory": "Supermarket", "keywords": ["سعودي", "ماركت سعودي", "سعودى"], "isInstallmentCommon": False},
    {"merchant": "Kazyon", "category": "Groceries", "subCategory": "Supermarket", "keywords": ["كازيون", "كزيون"], "isInstallmentCommon": False},
    {"merchant": "BIM", "category": "Groceries", "subCategory": "Supermarket", "keywords": ["بيم"], "isInstallmentCommon": False},
    {"merchant": "Awlad Ragab", "category": "Groceries", "subCategory": "Supermarket", "keywords": ["اولاد رجب", "أولاد رجب"], "isInstallmentCommon": False},
    {"merchant": "Hyper One", "category": "Groceries", "subCategory": "Supermarket", "keywords": ["هايبر وان", "هايبروان"], "isInstallmentCommon": True},
    {"merchant": "Oscar", "category": "Groceries", "subCategory": "Supermarket", "keywords": ["اوسكار", "أوسكار"], "isInstallmentCommon": False},
    {"merchant": "Fathalla", "category": "Groceries", "subCategory": "Supermarket", "keywords": ["فتح الله", "اسواق فتح الله"], "isInstallmentCommon": False},
    {"merchant": "Zahran", "category": "Groceries", "subCategory": "Supermarket", "keywords": ["زهران", "ماركت زهران"], "isInstallmentCommon": False},
    {"merchant": "Gourmet", "category": "Groceries", "subCategory": "Supermarket", "keywords": ["جورميه", "غورميه"], "isInstallmentCommon": False},
    {"merchant": "Abu Ashara", "category": "Groceries", "subCategory": "Supermarket", "keywords": ["ابو عشرة", "أبو عشرة"], "isInstallmentCommon": False},
    {"merchant": "Lulu Hypermarket", "category": "Groceries", "subCategory": "Supermarket", "keywords": ["لولو", "لولو هايبر", "Lulu"], "isInstallmentCommon": False},
    {"merchant": "Metro Market", "category": "Groceries", "subCategory": "Supermarket", "keywords": ["مترو ماركت", "مترو ماركت"], "isInstallmentCommon": False},
    {"merchant": "Kheir Zaman", "category": "Groceries", "subCategory": "Supermarket", "keywords": ["خير زمان", "خيرزمان"], "isInstallmentCommon": False},
    {"merchant": "El Hawary", "category": "Groceries", "subCategory": "Supermarket", "keywords": ["الهواري", "الهوارى"], "isInstallmentCommon": False},
    {"merchant": "Mahmoud Elfar", "category": "Groceries", "subCategory": "Supermarket", "keywords": ["محمود الفار", "الفار"], "isInstallmentCommon": False},

    # Electronics & Installments & Shopping
    {"merchant": "B.TECH", "category": "Electronics", "subCategory": "Retail & Installments", "keywords": ["بي تك", "بيتك", "BTECH", "B TECH"], "isInstallmentCommon": True},
    {"merchant": "Raneen", "category": "Shopping", "subCategory": "Home & Electronics", "keywords": ["رنين", "عروض رنين"], "isInstallmentCommon": True},
    {"merchant": "Aman", "category": "Financial", "subCategory": "Installments", "keywords": ["امان", "أمان", "تقسيط امان"], "isInstallmentCommon": True},
    {"merchant": "ValU", "category": "Financial", "subCategory": "Installments", "keywords": ["فاليو", "ڤاليو", "تقسيط فاليو"], "isInstallmentCommon": True},
    {"merchant": "Sympl", "category": "Financial", "subCategory": "Installments", "keywords": ["سيمبل", "سمبل", "تقسيط سيمبل"], "isInstallmentCommon": True},
    {"merchant": "Shahry", "category": "Financial", "subCategory": "Installments", "keywords": ["شهري", "شهرى"], "isInstallmentCommon": True},
    {"merchant": "Amazon Egypt", "category": "Shopping", "subCategory": "E-commerce", "keywords": ["امازون", "أمازون", "سوق دوت كوم", "Souq"], "isInstallmentCommon": True},
    {"merchant": "Jumia", "category": "Shopping", "subCategory": "E-commerce", "keywords": ["جوميا"], "isInstallmentCommon": True},
    {"merchant": "Noon", "category": "Shopping", "subCategory": "E-commerce", "keywords": ["نون"], "isInstallmentCommon": True},
    {"merchant": "Raya Shop", "category": "Electronics", "subCategory": "Retail & Installments", "keywords": ["راية", "رايه", "راية شوب"], "isInstallmentCommon": True},
    {"merchant": "2B", "category": "Electronics", "subCategory": "Retail & Installments", "keywords": ["تو بي", "توبي"], "isInstallmentCommon": True},
    {"merchant": "El Araby Group", "category": "Electronics", "subCategory": "Retail & Installments", "keywords": ["العربي", "العربى", "مجموعة العربي", "توشيبا", "Toshiba", "Tornado", "تورنيدو"], "isInstallmentCommon": True},
    {"merchant": "Fresh", "category": "Electronics", "subCategory": "Retail", "keywords": ["فريش", "اجهزة فريش"], "isInstallmentCommon": True},
    {"merchant": "Unionaire", "category": "Electronics", "subCategory": "Retail", "keywords": ["يونيون اير", "يونيون اير"], "isInstallmentCommon": True},
    {"merchant": "Premium Card", "category": "Financial", "subCategory": "Installments", "keywords": ["بريميوم كارد", "بريميم كارد"], "isInstallmentCommon": True},
    {"merchant": "Contact", "category": "Financial", "subCategory": "Installments", "keywords": ["كونتكت", "كونتكت للتقسيط"], "isInstallmentCommon": True},
    {"merchant": "Souhoola", "category": "Financial", "subCategory": "Installments", "keywords": ["سهولة", "تقسيط سهولة"], "isInstallmentCommon": True},
    {"merchant": "Forsa", "category": "Financial", "subCategory": "Installments", "keywords": ["فرصة", "ابلكيشن فرصة"], "isInstallmentCommon": True},

    # Restaurants & Cafes
    {"merchant": "KFC", "category": "Food", "subCategory": "Fast Food", "keywords": ["كنتاكي", "كنتاكى", "دجاج كنتاكي"], "isInstallmentCommon": False},
    {"merchant": "McDonald's", "category": "Food", "subCategory": "Fast Food", "keywords": ["ماكدونالدز", "ماك", "Mac", "Mcdonalds"], "isInstallmentCommon": False},
    {"merchant": "Buffalo Burger", "category": "Food", "subCategory": "Fast Food", "keywords": ["بافلو برجر", "بافلو", "بافلوا"], "isInstallmentCommon": False},
    {"merchant": "Bazooka", "category": "Food", "subCategory": "Fast Food", "keywords": ["بازوكا", "بزوكا"], "isInstallmentCommon": False},
    {"merchant": "Spectra", "category": "Food", "subCategory": "Restaurant", "keywords": ["سبكترا"], "isInstallmentCommon": False},
    {"merchant": "Cilantro", "category": "Food", "subCategory": "Cafe", "keywords": ["سيلانترو", "سلانترو"], "isInstallmentCommon": False},
    {"merchant": "Costa Coffee", "category": "Food", "subCategory": "Cafe", "keywords": ["كوستا", "كافيه كوستا"], "isInstallmentCommon": False},
    {"merchant": "Starbucks", "category": "Food", "subCategory": "Cafe", "keywords": ["ستاربكس", "استاربكس"], "isInstallmentCommon": False},
    {"merchant": "TBS", "category": "Food", "subCategory": "Bakery", "keywords": ["تي بي اس", "المخبز", "The Bakery Shop"], "isInstallmentCommon": False},
    {"merchant": "Hardee's", "category": "Food", "subCategory": "Fast Food", "keywords": ["هارديز"], "isInstallmentCommon": False},
    {"merchant": "Pizza Hut", "category": "Food", "subCategory": "Fast Food", "keywords": ["بيتزا هت"], "isInstallmentCommon": False},
    {"merchant": "Papa John's", "category": "Food", "subCategory": "Fast Food", "keywords": ["بابا جونز"], "isInstallmentCommon": False},
    {"merchant": "Domino's Pizza", "category": "Food", "subCategory": "Fast Food", "keywords": ["دومينوز", "دومينوز بيتزا"], "isInstallmentCommon": False},
    {"merchant": "Pronto Pizza", "category": "Food", "subCategory": "Fast Food", "keywords": ["برونتو", "برونتو بيتزا"], "isInstallmentCommon": False},
    {"merchant": "Cook Door", "category": "Food", "subCategory": "Fast Food", "keywords": ["كوك دور", "كوكدور"], "isInstallmentCommon": False},
    {"merchant": "Mo'men", "category": "Food", "subCategory": "Fast Food", "keywords": ["مؤمن", "سندوتشات مؤمن"], "isInstallmentCommon": False},
    {"merchant": "Prego", "category": "Food", "subCategory": "Fast Food", "keywords": ["بريجو"], "isInstallmentCommon": False},
    {"merchant": "Koshary El Tahrir", "category": "Food", "subCategory": "Restaurant", "keywords": ["كشري التحرير", "كشرى التحرير"], "isInstallmentCommon": False},
    {"merchant": "Koshary Abou Tarek", "category": "Food", "subCategory": "Restaurant", "keywords": ["كشري ابو طارق", "ابو طارق"], "isInstallmentCommon": False},
    {"merchant": "Sayed Hanafy", "category": "Food", "subCategory": "Restaurant", "keywords": ["سيد حنفي", "سيد حنفى"], "isInstallmentCommon": False},
    {"merchant": "Majesty", "category": "Food", "subCategory": "Fast Food", "keywords": ["ماجيستي", "ماجيستى"], "isInstallmentCommon": False},
    {"merchant": "El Dawar", "category": "Food", "subCategory": "Restaurant", "keywords": ["الدوار", "فطاطري الدوار"], "isInstallmentCommon": False},
    {"merchant": "Willy's Kitchen", "category": "Food", "subCategory": "Fast Food", "keywords": ["ويليز كيتشن", "ويليز"], "isInstallmentCommon": False},
    {"merchant": "Zack's", "category": "Food", "subCategory": "Fast Food", "keywords": ["زاكس"], "isInstallmentCommon": False},
    {"merchant": "Heart Attack", "category": "Food", "subCategory": "Fast Food", "keywords": ["هارت اتاك", "هارت أتاك"], "isInstallmentCommon": False},
    {"merchant": "Macarona Reda", "category": "Food", "subCategory": "Restaurant", "keywords": ["مكرونة رضا", "مكرونه رضا"], "isInstallmentCommon": False},
    {"merchant": "Sobhy Kaber", "category": "Food", "subCategory": "Restaurant", "keywords": ["صبحي كابر", "صبحى كابر"], "isInstallmentCommon": False},
    {"merchant": "El Prince", "category": "Food", "subCategory": "Restaurant", "keywords": ["البرنس", "كبدة البرنس"], "isInstallmentCommon": False},
    {"merchant": "Qasr El Kababgi", "category": "Food", "subCategory": "Restaurant", "keywords": ["قصر الكبابجي", "الكبابجي"], "isInstallmentCommon": False},
    {"merchant": "Andrea", "category": "Food", "subCategory": "Restaurant", "keywords": ["اندريا", "أندريا"], "isInstallmentCommon": False},
    {"merchant": "Abou Shakra", "category": "Food", "subCategory": "Restaurant", "keywords": ["ابو شقرة", "أبو شقرة"], "isInstallmentCommon": False},
    {"merchant": "Beano's", "category": "Food", "subCategory": "Cafe", "keywords": ["بينوز", "بينوز كافيه"], "isInstallmentCommon": False},
    {"merchant": "Espresso Lab", "category": "Food", "subCategory": "Cafe", "keywords": ["اسبريسو لاب", "اسبريسولاب"], "isInstallmentCommon": False},
    {"merchant": "Paul", "category": "Food", "subCategory": "Cafe", "keywords": ["بول", "مخبز بول"], "isInstallmentCommon": False},
    {"merchant": "Second Cup", "category": "Food", "subCategory": "Cafe", "keywords": ["سكند كاب", "سكند كوب"], "isInstallmentCommon": False},
    {"merchant": "Cinnabon", "category": "Food", "subCategory": "Bakery", "keywords": ["سينابون"], "isInstallmentCommon": False},
    {"merchant": "Dunkin' Donuts", "category": "Food", "subCategory": "Bakery", "keywords": ["دانكن", "دانكن دونتس"], "isInstallmentCommon": False},
    {"merchant": "Krispy Kreme", "category": "Food", "subCategory": "Bakery", "keywords": ["كريسبي كريم", "كرسبي كريم"], "isInstallmentCommon": False},
    {"merchant": "Nola", "category": "Food", "subCategory": "Bakery", "keywords": ["نولا", "نولا كب كيك"], "isInstallmentCommon": False},
    {"merchant": "Salé Sucré", "category": "Food", "subCategory": "Bakery", "keywords": ["ساليه سوكريه"], "isInstallmentCommon": False},
    {"merchant": "La Poire", "category": "Food", "subCategory": "Bakery", "keywords": ["لابوار", "لا بوار"], "isInstallmentCommon": False},
    {"merchant": "El Abd Patisserie", "category": "Food", "subCategory": "Bakery", "keywords": ["حلواني العبد", "العبد"], "isInstallmentCommon": False},
    {"merchant": "Tseppas", "category": "Food", "subCategory": "Bakery", "keywords": ["تسيباس"], "isInstallmentCommon": False},
    {"merchant": "Etoile", "category": "Food", "subCategory": "Bakery", "keywords": ["ايتوال", "إيتوال"], "isInstallmentCommon": False},
    {"merchant": "Mandarine Koueider", "category": "Food", "subCategory": "Bakery", "keywords": ["ماندرين قويدر", "قويدر"], "isInstallmentCommon": False},
    {"merchant": "Twinkies", "category": "Food", "subCategory": "Bakery", "keywords": ["توينكيز", "تونكيز"], "isInstallmentCommon": False},
    {"merchant": "Monginis", "category": "Food", "subCategory": "Bakery", "keywords": ["مونجيني", "مونجينى"], "isInstallmentCommon": False},

    # Healthcare
    {"merchant": "Vezeeta", "category": "Health", "subCategory": "Booking", "keywords": ["فيزيتا", "ڤيزيتا"], "isInstallmentCommon": False},
    {"merchant": "Yashfee", "category": "Health", "subCategory": "Pharmacy", "keywords": ["يشفي", "يشفى", "صيدلية يشفي"], "isInstallmentCommon": False},
    {"merchant": "El Ezaby Pharmacy", "category": "Health", "subCategory": "Pharmacy", "keywords": ["العزبي", "صيدلية العزبي", "صيدليات العزبي"], "isInstallmentCommon": False},
    {"merchant": "Seif Pharmacy", "category": "Health", "subCategory": "Pharmacy", "keywords": ["سيف", "صيدلية سيف", "صيدليات سيف"], "isInstallmentCommon": False},
    {"merchant": "19011 Pharmacy", "category": "Health", "subCategory": "Pharmacy", "keywords": ["صيدليات 19011", "19011", "صيدلية 19011"], "isInstallmentCommon": False},
    {"merchant": "Roshdy Pharmacy", "category": "Health", "subCategory": "Pharmacy", "keywords": ["رشدي", "صيدليات رشدي"], "isInstallmentCommon": False},
    {"merchant": "Elezz Pharmacy", "category": "Health", "subCategory": "Pharmacy", "keywords": ["العز", "صيدليات العز"], "isInstallmentCommon": False},
    {"merchant": "Chefaa", "category": "Health", "subCategory": "Pharmacy", "keywords": ["شفاء", "تطبيق شفاء"], "isInstallmentCommon": False},
    {"merchant": "Dawaya", "category": "Health", "subCategory": "Pharmacy", "keywords": ["دوايا"], "isInstallmentCommon": False},
    {"merchant": "Esaal", "category": "Health", "subCategory": "Consultation", "keywords": ["اسأل", "إسأل"], "isInstallmentCommon": False},
    {"merchant": "Dawi Clinics", "category": "Health", "subCategory": "Clinics", "keywords": ["عيادات داوي", "داوي"], "isInstallmentCommon": False},
    {"merchant": "Andalusia Hospitals", "category": "Health", "subCategory": "Hospital", "keywords": ["مستشفيات اندلسية", "اندلسية"], "isInstallmentCommon": True},
    {"merchant": "Cleopatra Hospitals", "category": "Health", "subCategory": "Hospital", "keywords": ["كليوباترا", "مستشفى كليوباترا"], "isInstallmentCommon": True},
    {"merchant": "Magdi Yacoub Heart Foundation", "category": "Charity", "subCategory": "Donation", "keywords": ["مؤسسة مجدي يعقوب", "مستشفى مجدي يعقوب", "مؤسسة مجدى يعقوب"], "isInstallmentCommon": False},
    {"merchant": "Baheya Foundation", "category": "Charity", "subCategory": "Donation", "keywords": ["مؤسسة بهية", "مستشفى بهية"], "isInstallmentCommon": False},
    {"merchant": "57357 Hospital", "category": "Charity", "subCategory": "Donation", "keywords": ["مستشفى 57357", "مستشفى سرطان الاطفال", "57357"], "isInstallmentCommon": False},
    {"merchant": "Orman Association", "category": "Charity", "subCategory": "Donation", "keywords": ["جمعية الاورمان", "الاورمان"], "isInstallmentCommon": False},
    {"merchant": "Resala Association", "category": "Charity", "subCategory": "Donation", "keywords": ["جمعية رسالة", "رسالة"], "isInstallmentCommon": False},
    {"merchant": "Misr El Kheir", "category": "Charity", "subCategory": "Donation", "keywords": ["مصر الخير", "مؤسسة مصر الخير"], "isInstallmentCommon": False},
    {"merchant": "Food Bank", "category": "Charity", "subCategory": "Donation", "keywords": ["بنك الطعام", "بنك الطعام المصري"], "isInstallmentCommon": False},

    # Entertainment & Subscriptions
    {"merchant": "Netflix", "category": "Entertainment", "subCategory": "Streaming", "keywords": ["نتفليكس", "نتفلكس"], "isInstallmentCommon": False},
    {"merchant": "WatchIT", "category": "Entertainment", "subCategory": "Streaming", "keywords": ["واتش ات", "واتشيت", "Watch It"], "isInstallmentCommon": False},
    {"merchant": "Shahid", "category": "Entertainment", "subCategory": "Streaming", "keywords": ["شاهد", "شاهد نت", "شاهد في اي بي"], "isInstallmentCommon": False},
    {"merchant": "OSN+", "category": "Entertainment", "subCategory": "Streaming", "keywords": ["اواس ان", "او اس ان", "OSN"], "isInstallmentCommon": False},
    {"merchant": "Spotify", "category": "Entertainment", "subCategory": "Music", "keywords": ["سبوتيفاي", "اسبوتيفاي"], "isInstallmentCommon": False},
    {"merchant": "Anghami", "category": "Entertainment", "subCategory": "Music", "keywords": ["انغامي", "أنغامي"], "isInstallmentCommon": False},
    {"merchant": "YouTube Premium", "category": "Entertainment", "subCategory": "Streaming", "keywords": ["يوتيوب بريميوم", "يوتيوب"], "isInstallmentCommon": False},
    {"merchant": "Todd", "category": "Entertainment", "subCategory": "Streaming", "keywords": ["تود", "منصة تود"], "isInstallmentCommon": False},
    {"merchant": "beIN Sports", "category": "Entertainment", "subCategory": "Sports", "keywords": ["بي ان سبورت", "بين سبورت"], "isInstallmentCommon": False},
    {"merchant": "Vox Cinemas", "category": "Entertainment", "subCategory": "Cinema", "keywords": ["ڤوكس", "فوكس سينما", "سينما فوكس"], "isInstallmentCommon": False},
    {"merchant": "Renaissance Cinemas", "category": "Entertainment", "subCategory": "Cinema", "keywords": ["رينيسانس", "سينما رينيسانس"], "isInstallmentCommon": False},
    {"merchant": "Galaxy Cinema", "category": "Entertainment", "subCategory": "Cinema", "keywords": ["جلاكسي", "سينما جلاكسي"], "isInstallmentCommon": False},
    {"merchant": "Plaza Cinema", "category": "Entertainment", "subCategory": "Cinema", "keywords": ["بلازا", "سينما بلازا"], "isInstallmentCommon": False},
    {"merchant": "Dream Park", "category": "Entertainment", "subCategory": "Theme Park", "keywords": ["دريم بارك", "ملاهي دريم بارك"], "isInstallmentCommon": False},
    {"merchant": "Zed Park", "category": "Entertainment", "subCategory": "Theme Park", "keywords": ["زيد بارك", "ملاهي زيد", "زد بارك"], "isInstallmentCommon": False},
    {"merchant": "Magic Planet", "category": "Entertainment", "subCategory": "Theme Park", "keywords": ["ماجيك بلانيت", "ماجيك بلانت"], "isInstallmentCommon": False},
    {"merchant": "Ski Egypt", "category": "Entertainment", "subCategory": "Theme Park", "keywords": ["سكي ايجيبت", "سكي مصر"], "isInstallmentCommon": False},

    # Fashion & Retail
    {"merchant": "Zara", "category": "Shopping", "subCategory": "Fashion", "keywords": ["زارا", "زرا"], "isInstallmentCommon": True},
    {"merchant": "H&M", "category": "Shopping", "subCategory": "Fashion", "keywords": ["اتش اند ام", "اتش اند إم"], "isInstallmentCommon": True},
    {"merchant": "LC Waikiki", "category": "Shopping", "subCategory": "Fashion", "keywords": ["ال سي وايكيكي", "وايكيكي", "ال سى وايكيكى"], "isInstallmentCommon": True},
    {"merchant": "Defacto", "category": "Shopping", "subCategory": "Fashion", "keywords": ["ديفاكتو", "دي فاكتو"], "isInstallmentCommon": True},
    {"merchant": "Town Team", "category": "Shopping", "subCategory": "Fashion", "keywords": ["تاون تيم"], "isInstallmentCommon": True},
    {"merchant": "Ravin", "category": "Shopping", "subCategory": "Fashion", "keywords": ["رافين"], "isInstallmentCommon": True},
    {"merchant": "Max Fashion", "category": "Shopping", "subCategory": "Fashion", "keywords": ["ماكس", "ماكس فاشون"], "isInstallmentCommon": True},
    {"merchant": "Splash", "category": "Shopping", "subCategory": "Fashion", "keywords": ["سبلاش"], "isInstallmentCommon": True},
    {"merchant": "Adidas", "category": "Shopping", "subCategory": "Fashion", "keywords": ["اديداس", "أديداس"], "isInstallmentCommon": True},
    {"merchant": "Nike", "category": "Shopping", "subCategory": "Fashion", "keywords": ["نايك", "نايكي"], "isInstallmentCommon": True},
    {"merchant": "Puma", "category": "Shopping", "subCategory": "Fashion", "keywords": ["بوما"], "isInstallmentCommon": True},
    {"merchant": "Reebok", "category": "Shopping", "subCategory": "Fashion", "keywords": ["ريبوك"], "isInstallmentCommon": True},
    {"merchant": "Activ", "category": "Shopping", "subCategory": "Fashion", "keywords": ["اكتيف", "أكتيف"], "isInstallmentCommon": True},
    {"merchant": "Kickers", "category": "Shopping", "subCategory": "Fashion", "keywords": ["كيكرز"], "isInstallmentCommon": True},
    {"merchant": "Aldo", "category": "Shopping", "subCategory": "Fashion", "keywords": ["الدو", "ألدو"], "isInstallmentCommon": True},
    {"merchant": "Bata", "category": "Shopping", "subCategory": "Fashion", "keywords": ["باتا", "احذية باتا"], "isInstallmentCommon": True},

    # Services & Bills
    {"merchant": "Fawry", "category": "Bills", "subCategory": "Payment Gateway", "keywords": ["فوري", "فورى"], "isInstallmentCommon": False},
    {"merchant": "Masary", "category": "Bills", "subCategory": "Payment Gateway", "keywords": ["مصاري", "مصارى"], "isInstallmentCommon": False},
    {"merchant": "Bee", "category": "Bills", "subCategory": "Payment Gateway", "keywords": ["بي", "خدمات بي", "دفع بي"], "isInstallmentCommon": False},
    {"merchant": "Khales", "category": "Bills", "subCategory": "Payment Gateway", "keywords": ["خالص", "خدمات خالص"], "isInstallmentCommon": False},
    {"merchant": "Sahl", "category": "Bills", "subCategory": "Payment Gateway", "keywords": ["سهل", "تطبيق سهل"], "isInstallmentCommon": False},
    {"merchant": "EEHC", "category": "Bills", "subCategory": "Electricity", "keywords": ["الكهرباء", "فاتورة الكهرباء", "شركة الكهرباء"], "isInstallmentCommon": False},
    {"merchant": "Egypt Gas", "category": "Bills", "subCategory": "Gas", "keywords": ["الغاز", "فاتورة الغاز", "شركة الغاز", "بتروتريد", "Petrotrade", "غاز مصر"], "isInstallmentCommon": False},
    {"merchant": "HCWW", "category": "Bills", "subCategory": "Water", "keywords": ["المياه", "فاتورة المياه", "شركة المياه"], "isInstallmentCommon": False},
    {"merchant": "Syndicate", "category": "Bills", "subCategory": "Syndicate", "keywords": ["نقابة", "النقابة", "اشتراك النقابة"], "isInstallmentCommon": False},
    {"merchant": "Traffic", "category": "Bills", "subCategory": "Traffic", "keywords": ["المرور", "مخالفات المرور", "رخصة"], "isInstallmentCommon": False},

    # Furniture & Home
    {"merchant": "IKEA", "category": "Shopping", "subCategory": "Furniture", "keywords": ["ايكيا", "إيكيا"], "isInstallmentCommon": True},
    {"merchant": "In&Out", "category": "Shopping", "subCategory": "Furniture", "keywords": ["ان اند اوت", "إن أند أوت"], "isInstallmentCommon": True},
    {"merchant": "Hub Furniture", "category": "Shopping", "subCategory": "Furniture", "keywords": ["هاب فرنيتشر", "هاب للاثاث"], "isInstallmentCommon": True},
    {"merchant": "Kemitt", "category": "Shopping", "subCategory": "Furniture", "keywords": ["كيميت"], "isInstallmentCommon": True},
    {"merchant": "Homzmart", "category": "Shopping", "subCategory": "Furniture", "keywords": ["هومزمارت"], "isInstallmentCommon": True},
    {"merchant": "Ariika", "category": "Shopping", "subCategory": "Furniture", "keywords": ["اريكا", "أريكا", "بين باج"], "isInstallmentCommon": True},
    {"merchant": "Kabbani Furniture", "category": "Shopping", "subCategory": "Furniture", "keywords": ["قباني", "قباني للاثاث"], "isInstallmentCommon": True},

    # Banks & Financial Apps
    {"merchant": "InstaPay", "category": "Financial", "subCategory": "Transfer", "keywords": ["انستاباي", "انستا باي", "انستا باى"], "isInstallmentCommon": False},
    {"merchant": "NBE", "category": "Financial", "subCategory": "Bank", "keywords": ["البنك الاهلي", "البنك الاهلى المصرى", "الاهلي"], "isInstallmentCommon": True},
    {"merchant": "Banque Misr", "category": "Financial", "subCategory": "Bank", "keywords": ["بنك مصر", "بنكمصر"], "isInstallmentCommon": True},
    {"merchant": "CIB", "category": "Financial", "subCategory": "Bank", "keywords": ["السي اي بي", "سي اي بي", "البنك التجاري الدولي", "التجاري الدولي"], "isInstallmentCommon": True},
    {"merchant": "QNB", "category": "Financial", "subCategory": "Bank", "keywords": ["كيو ان بي", "قطر الوطني"], "isInstallmentCommon": True},
    {"merchant": "Alex Bank", "category": "Financial", "subCategory": "Bank", "keywords": ["بنك اسكندرية", "بنك الاسكندرية"], "isInstallmentCommon": True},
    {"merchant": "Banque du Caire", "category": "Financial", "subCategory": "Bank", "keywords": ["بنك القاهرة", "القاهرة"], "isInstallmentCommon": True},
    {"merchant": "Vodafone Cash", "category": "Financial", "subCategory": "Mobile Wallet", "keywords": ["فودافون كاش", "فودافونكاش"], "isInstallmentCommon": False},
    {"merchant": "Orange Cash", "category": "Financial", "subCategory": "Mobile Wallet", "keywords": ["اورانج كاش", "اورنج كاش"], "isInstallmentCommon": False},
    {"merchant": "Etisalat Cash", "category": "Financial", "subCategory": "Mobile Wallet", "keywords": ["اتصالات كاش"], "isInstallmentCommon": False},
    {"merchant": "WE Pay", "category": "Financial", "subCategory": "Mobile Wallet", "keywords": ["وي باي", "محفظة وي"], "isInstallmentCommon": False},
    {"merchant": "Smart Wallet", "category": "Financial", "subCategory": "Mobile Wallet", "keywords": ["المحفظة الذكية", "سمارت والت"], "isInstallmentCommon": False},
    {"merchant": "Telda", "category": "Financial", "subCategory": "App", "keywords": ["تيلدا", "تلدا"], "isInstallmentCommon": False},
    {"merchant": "Nexta", "category": "Financial", "subCategory": "App", "keywords": ["نكستا"], "isInstallmentCommon": False},
    {"merchant": "Klivvr", "category": "Financial", "subCategory": "App", "keywords": ["كليفر"], "isInstallmentCommon": False},
    {"merchant": "Thndr", "category": "Financial", "subCategory": "App", "keywords": ["ثاندر", "تطبيق ثاندر", "استثمار"], "isInstallmentCommon": False},
    
    # Real Estate & Maintenance
    {"merchant": "FilKhedma", "category": "Services", "subCategory": "Maintenance", "keywords": ["في الخدمة", "فى الخدمة"], "isInstallmentCommon": False},
    {"merchant": "Taskty", "category": "Services", "subCategory": "Maintenance", "keywords": ["تاسكتي", "تاسكتى"], "isInstallmentCommon": False},
    
    # Slang & General Expenses
    {"merchant": "General Transport", "category": "Transport", "subCategory": "Micobuses & Taxis", "keywords": ["ميكروباص", "مكروباص", "تاكسي", "مواصلات", "توكتوك", "تكتك"], "isInstallmentCommon": False},
    {"merchant": "General Coffee", "category": "Food", "subCategory": "Cafe", "keywords": ["قهوة", "مقهى", "شاي", "شيشة", "مشاريب"], "isInstallmentCommon": False},
    {"merchant": "General Groceries", "category": "Groceries", "subCategory": "Local", "keywords": ["كشك", "سوبر ماركت", "بقالة", "بقال"], "isInstallmentCommon": False},
    {"merchant": "General Food", "category": "Food", "subCategory": "Local", "keywords": ["عربية فول", "فطار", "غداء", "عشاء", "سندوتشات"], "isInstallmentCommon": False},
    {"merchant": "Tips & Baksheesh", "category": "Services", "subCategory": "Tips", "keywords": ["بقشيش", "تبس", "تيبس", "لله", "سايس", "بواب"], "isInstallmentCommon": False},
    {"merchant": "Gas Station", "category": "Transport", "subCategory": "Fuel", "keywords": ["بنزينة", "تفويلة", "بنزين", "وطنية", "امارات مصر", "شيل", "توتال"], "isInstallmentCommon": False},
    {"merchant": "Barber / Salon", "category": "Services", "subCategory": "Personal Care", "keywords": ["حلاق", "كوافير", "صالون"], "isInstallmentCommon": False},
    {"merchant": "Laundry", "category": "Services", "subCategory": "Personal Care", "keywords": ["مكوجي", "دراي كلين", "مغسلة", "دري كلين"], "isInstallmentCommon": False},
    {"merchant": "Education", "category": "Services", "subCategory": "Education", "keywords": ["مدرسة", "جامعة", "كورس", "دروس", "سنتر", "كتب", "مكتبة"], "isInstallmentCommon": False},
    {"merchant": "Gym", "category": "Health", "subCategory": "Fitness", "keywords": ["جيم", "نادي", "اشتراك جيم", "جولدز جيم", "سمارت جيم"], "isInstallmentCommon": False},
]

additional_data = [
    # More Fashion
    {"merchant": "Dejavu", "category": "Shopping", "subCategory": "Fashion", "keywords": ["ديجافو", "احذية ديجافو"], "isInstallmentCommon": True},
    {"merchant": "Pixi", "category": "Shopping", "subCategory": "Fashion", "keywords": ["بيكسي", "بكسي"], "isInstallmentCommon": True},
    {"merchant": "Or", "category": "Shopping", "subCategory": "Fashion", "keywords": ["اور", "محلات اور"], "isInstallmentCommon": True},
    {"merchant": "Dalin", "category": "Shopping", "subCategory": "Fashion", "keywords": ["دالين"], "isInstallmentCommon": True},
    {"merchant": "Cottonil", "category": "Shopping", "subCategory": "Fashion", "keywords": ["قطونيل", "قطنيل"], "isInstallmentCommon": True},
    {"merchant": "Dice", "category": "Shopping", "subCategory": "Fashion", "keywords": ["دايس", "ديس"], "isInstallmentCommon": True},
    {"merchant": "Embrator", "category": "Shopping", "subCategory": "Fashion", "keywords": ["الامبراطور", "امبراطور"], "isInstallmentCommon": True},
    
    # Beauty & Cosmetics
    {"merchant": "Mazaya", "category": "Shopping", "subCategory": "Cosmetics", "keywords": ["مزايا", "مزايا للعطور"], "isInstallmentCommon": True},
    {"merchant": "Faces", "category": "Shopping", "subCategory": "Cosmetics", "keywords": ["فيسيز", "وجوه"], "isInstallmentCommon": True},
    {"merchant": "Fortune", "category": "Shopping", "subCategory": "Cosmetics", "keywords": ["فورتشن", "فورشن"], "isInstallmentCommon": False},
    {"merchant": "Bath & Body Works", "category": "Shopping", "subCategory": "Cosmetics", "keywords": ["باث اند بودي", "باث اند بودى ووركس"], "isInstallmentCommon": True},
    {"merchant": "The Body Shop", "category": "Shopping", "subCategory": "Cosmetics", "keywords": ["ذا بودي شوب", "بودي شوب"], "isInstallmentCommon": True},

    # Kids & Toys
    {"merchant": "Hedeya", "category": "Shopping", "subCategory": "Toys", "keywords": ["هدية", "محلات هدية", "لعب اطفال"], "isInstallmentCommon": True},
    {"merchant": "Mothercare", "category": "Shopping", "subCategory": "Kids", "keywords": ["مذركير", "مذر كير"], "isInstallmentCommon": True},
    {"merchant": "Toy World", "category": "Shopping", "subCategory": "Toys", "keywords": ["توي ورلد", "توي وورلد"], "isInstallmentCommon": False},

    # Eyewear
    {"merchant": "Baraka", "category": "Shopping", "subCategory": "Eyewear", "keywords": ["بركة", "بركة للنظارات", "نظارات"], "isInstallmentCommon": True},
    {"merchant": "C&Co", "category": "Shopping", "subCategory": "Eyewear", "keywords": ["سي اند كو", "سى اند كو"], "isInstallmentCommon": True},
    {"merchant": "Magrabi", "category": "Shopping", "subCategory": "Eyewear", "keywords": ["مغربي", "مغربي للنظارات"], "isInstallmentCommon": True},

    # Pets
    {"merchant": "Amin Pet Shop", "category": "Shopping", "subCategory": "Pets", "keywords": ["امين بت شوب", "اكل كلاب", "اكل قطط", "دراي فود"], "isInstallmentCommon": False},
    {"merchant": "Pets Egypt", "category": "Shopping", "subCategory": "Pets", "keywords": ["بتس ايجيبت"], "isInstallmentCommon": False},

    # Car Maintenance
    {"merchant": "Ghabbour Auto", "category": "Services", "subCategory": "Car Maintenance", "keywords": ["غبور", "صيانة غبور", "جي بي اوتو", "GB Auto"], "isInstallmentCommon": True},
    {"merchant": "Mansour Auto", "category": "Services", "subCategory": "Car Maintenance", "keywords": ["منصور", "صيانة منصور", "منصور شيفروليه"], "isInstallmentCommon": True},
    {"merchant": "Nacita", "category": "Services", "subCategory": "Car Maintenance", "keywords": ["ناسيتا", "نصيتا"], "isInstallmentCommon": True},
    {"merchant": "Fit & Fix", "category": "Services", "subCategory": "Car Maintenance", "keywords": ["فيت اند فيكس", "فيت و فيكس", "كاوتش"], "isInstallmentCommon": True},
    
    # E-Wallets and Finance Additions
    {"merchant": "MoneyFellows", "category": "Financial", "subCategory": "App", "keywords": ["ماني فيلوز", "ماني فلوز", "جمعية"], "isInstallmentCommon": False},
    
    # Coworking
    {"merchant": "AlMaqarr", "category": "Services", "subCategory": "Coworking", "keywords": ["المقر", "مساحة عمل", "وورك سبيس"], "isInstallmentCommon": False},
    {"merchant": "Makanak", "category": "Services", "subCategory": "Coworking", "keywords": ["مكانك", "وورك سبيس"], "isInstallmentCommon": False},
    
    # Bakeries & Sweets
    {"merchant": "Abu Auf", "category": "Food", "subCategory": "Nuts & Coffee", "keywords": ["ابو عوف", "أبو عوف", "قهوة ابو عوف"], "isInstallmentCommon": False},
    {"merchant": "El Mahdes", "category": "Food", "subCategory": "Nuts", "keywords": ["مقلة المهندس", "المهندس"], "isInstallmentCommon": False},

    # More tech
    {"merchant": "Tradeline", "category": "Electronics", "subCategory": "Retail & Installments", "keywords": ["تريد لاين", "تريدلاين", "ابل", "Apple"], "isInstallmentCommon": True},
    {"merchant": "Dream 2000", "category": "Electronics", "subCategory": "Retail & Installments", "keywords": ["دريم 2000", "دريم الفين"], "isInstallmentCommon": True},
    {"merchant": "El Safy", "category": "Electronics", "subCategory": "Retail & Installments", "keywords": ["الصافي", "الصافى", "الصافي ستورز"], "isInstallmentCommon": True},
    
    # Travel
    {"merchant": "EgyptAir", "category": "Transport", "subCategory": "Flight", "keywords": ["مصر للطيران", "تذاكر طيران"], "isInstallmentCommon": True},
    {"merchant": "Air Arabia", "category": "Transport", "subCategory": "Flight", "keywords": ["العربية للطيران", "طيران العربية"], "isInstallmentCommon": False},
    {"merchant": "Travco", "category": "Services", "subCategory": "Travel Agency", "keywords": ["ترافكو", "رحلة", "فندق"], "isInstallmentCommon": True},

    # Other General
    {"merchant": "Gifts / Hedeya", "category": "Shopping", "subCategory": "Gifts", "keywords": ["هدية", "عيد ميلاد", "مناسبة"], "isInstallmentCommon": False},
    {"merchant": "Pharmacy General", "category": "Health", "subCategory": "Pharmacy", "keywords": ["صيدلية", "ادوية", "دواء", "علاج", "روشتة"], "isInstallmentCommon": False}
]

data.extend(additional_data)

filepath = r"e:\smartspend_V1_fixed\api\lib\egypt_merchants_rag.json"
os.makedirs(os.path.dirname(filepath), exist_ok=True)
with open(filepath, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"Created file {filepath} with {len(data)} entries.")
