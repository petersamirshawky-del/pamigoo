// ============================================================
// PAMIGO Configuration
// ⚠️ الـ anon key ده public وآمن إنه يبان في الكود
// ⚠️ متحطش الـ service_role key هنا أبداً
// ============================================================

export const SUPABASE_URL = 'https://mzyzyfxvnjwufupaweab.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16eXp5Znh2bmp3dWZ1cGF3ZWFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5NjY1OTAsImV4cCI6MjEwNTU0MjU5MH0.XxLxPf6GfJMovCJJVYW3SjlKRM4ID98-Zs_XGOxOBi0';

export const ADMIN_BANK_CODE = 'PETAD-12321';
export const DEFAULT_RADIUS_KM = 2;
export const STORAGE_BUCKET = 'pamigo-media';

// أيقونات التصنيفات الرئيسية
export const CATEGORY_ICONS = {
  fashion: '👗',
  restaurants: '🍕',
  bigfood: '🍔',
  electronics: '📱',
  car_parts: '🛞',
  car_accessories: '🪞',
  car_repair: '🔧',
  clinics: '🩺',
  labs: '🧪',
  radiology: '📡',
  hospitals: '🏨'
};

// أسماء التصنيفات بالعربي
export const CATEGORY_NAMES = {
  fashion: '👗 ملابس',
  restaurants: '🍕 مطاعم',
  bigfood: '🍔 وجبات',
  electronics: '📱 إلكترونيات',
  car_parts: '🛞 قطع غيار',
  car_accessories: '🪞 كماليات',
  car_repair: '🔧 صيانة',
  clinics: '🩺 عيادات',
  labs: '🧪 معامل',
  radiology: '📡 أشعة',
  hospitals: '🏨 مستشفيات'
};

// التصنيفات الفرعية
export const SUB_CATEGORIES = {
  fashion: [
    { id: 'men', name: '👔 رجالي' },
    { id: 'women', name: '👗 حريمي' },
    { id: 'kids', name: '🧒 أطفال' },
    { id: 'shoes', name: '👟 أحذية' },
    { id: 'accessories', name: '👜 إكسسوارات' }
  ],
  restaurants: [
    { id: 'grills', name: '🍖 مشويات' },
    { id: 'pizza', name: '🍕 بيتزا' },
    { id: 'koshary', name: '🍲 كشري' },
    { id: 'seafood', name: '🐟 بحري' },
    { id: 'desserts', name: '🍰 حلويات' }
  ],
  bigfood: [
    { id: 'supermarket', name: '🛒 سوبر ماركت' },
    { id: 'grocery', name: '🏪 بقالة' },
    { id: 'veggies', name: '🥬 خضار وفاكهة' },
    { id: 'meat', name: '🥩 لحوم' },
    { id: 'dairy', name: '🥛 ألبان' }
  ],
  electronics: [
    { id: 'mobiles', name: '📱 موبايلات' },
    { id: 'laptops', name: '💻 لابتوبات' },
    { id: 'headphones', name: '🎧 سماعات' },
    { id: 'chargers', name: '🔌 شواحن' },
    { id: 'accessories', name: '🖱️ إكسسوارات' }
  ],
  car_parts: [
    { id: 'engines', name: '⚙️ محركات' },
    { id: 'brakes', name: '🛑 فرامل' },
    { id: 'electrical', name: '🔌 كهرباء' },
    { id: 'tires', name: '🛞 إطارات' },
    { id: 'oils', name: '🛢️ زيوت' }
  ],
  car_accessories: [
    { id: 'interior', name: '🪑 كماليات داخلية' },
    { id: 'exterior', name: '🚗 كماليات خارجية' },
    { id: 'audio', name: '🔊 صوتيات' },
    { id: 'floor', name: '🧶 فرش' }
  ],
  car_repair: [
    { id: 'mechanics', name: '🔧 ميكانيكا' },
    { id: 'electrical', name: '⚡ كهرباء سيارات' },
    { id: 'bodywork', name: '🔨 سمكرة' },
    { id: 'paint', name: '🎨 دهان' }
  ],
  clinics: [
    { id: 'dental', name: '🦷 أسنان' },
    { id: 'internal', name: '🩺 باطنة' },
    { id: 'pediatric', name: '👶 أطفال' },
    { id: 'derma', name: '🧴 جلدية' },
    { id: 'eyes', name: '👁️ عيون' }
  ],
  labs: [
    { id: 'blood', name: '🩸 تحاليل دم' },
    { id: 'urine', name: '🧪 تحاليل بول' },
    { id: 'hormones', name: '💉 هرمونات' },
    { id: 'micro', name: '🔬 ميكروبيولوجي' }
  ],
  radiology: [
    { id: 'xray', name: '📷 أشعة عادية' },
    { id: 'ct', name: '📡 مقطعية' },
    { id: 'mri', name: '🧲 رنين مغناطيسي' },
    { id: 'ultrasound', name: '🫀 موجات صوتية' }
  ],
  hospitals: [
    { id: 'er', name: '🚨 طوارئ' },
    { id: 'surgery', name: '🏥 عمليات' },
    { id: 'internal', name: '🛏️ أقسام داخلية' },
    { id: 'outpatient', name: '🚶 عيادات خارجية' }
  ]
};