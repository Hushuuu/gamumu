export type DrawGuessQuestionMode = 'free' | 'bank'

export const DRAW_GUESS_QUESTION_CATEGORIES = [
  { id: 'all', label: '全部分類' },
  { id: 'animals', label: '動物' },
  { id: 'food', label: '食物' },
  { id: 'daily-life', label: '日常生活' },
  { id: 'places', label: '地點與交通' },
  { id: 'nature', label: '自然與天氣' },
] as const

export type DrawGuessQuestionCategory = typeof DRAW_GUESS_QUESTION_CATEGORIES[number]['id']

export interface DrawGuessPrompt {
  id: string
  category: Exclude<DrawGuessQuestionCategory, 'all'>
  answer: string
  hint: string
}

export const DRAW_GUESS_QUESTION_BANK: DrawGuessPrompt[] = [
  { id: 'animal-cat', category: 'animals', answer: '貓', hint: '喜歡曬太陽、會喵喵叫的寵物' },
  { id: 'animal-elephant', category: 'animals', answer: '大象', hint: '有長鼻子和大耳朵的灰色動物' },
  { id: 'animal-giraffe', category: 'animals', answer: '長頸鹿', hint: '脖子很長，身上有斑點' },
  { id: 'animal-penguin', category: 'animals', answer: '企鵝', hint: '住在寒冷地區、走路搖搖擺擺的鳥' },
  { id: 'animal-turtle', category: 'animals', answer: '烏龜', hint: '背著硬殼、走路很慢的動物' },
  { id: 'animal-rabbit', category: 'animals', answer: '兔子', hint: '耳朵長長，喜歡吃紅蘿蔔' },
  { id: 'animal-octopus', category: 'animals', answer: '章魚', hint: '有八隻腕足的海洋生物' },
  { id: 'animal-butterfly', category: 'animals', answer: '蝴蝶', hint: '會飛舞、翅膀有漂亮花紋的昆蟲' },
  { id: 'animal-whale', category: 'animals', answer: '鯨魚', hint: '會噴水、生活在海中的大型哺乳類' },
  { id: 'animal-panda', category: 'animals', answer: '熊貓', hint: '黑白相間、愛吃竹子的動物' },
  { id: 'food-bubble-tea', category: 'food', answer: '珍珠奶茶', hint: '有嚼勁配料的台灣飲料' },
  { id: 'food-dumpling', category: 'food', answer: '水餃', hint: '用麵皮包餡，常在節日或晚餐吃' },
  { id: 'food-pizza', category: 'food', answer: '披薩', hint: '圓形麵餅上鋪滿起司和配料' },
  { id: 'food-ice-cream', category: 'food', answer: '冰淇淋', hint: '冰涼香甜，常用甜筒盛裝' },
  { id: 'food-watermelon', category: 'food', answer: '西瓜', hint: '夏天常吃的綠皮紅肉水果' },
  { id: 'food-sushi', category: 'food', answer: '壽司', hint: '用醋飯搭配魚肉或其他配料' },
  { id: 'food-hamburger', category: 'food', answer: '漢堡', hint: '兩片麵包夾著肉排和蔬菜' },
  { id: 'food-hotpot', category: 'food', answer: '火鍋', hint: '大家圍著一鍋熱湯煮各種食材' },
  { id: 'food-pineapple-cake', category: 'food', answer: '鳳梨酥', hint: '台灣常見的伴手禮點心' },
  { id: 'food-egg', category: 'food', answer: '雞蛋', hint: '有蛋殼，煎、煮、蒸都可以' },
  { id: 'daily-umbrella', category: 'daily-life', answer: '雨傘', hint: '下雨時拿在頭上擋雨的用品' },
  { id: 'daily-toothbrush', category: 'daily-life', answer: '牙刷', hint: '每天早晚拿來清潔牙齒' },
  { id: 'daily-alarm-clock', category: 'daily-life', answer: '鬧鐘', hint: '到了設定時間會提醒你起床' },
  { id: 'daily-glasses', category: 'daily-life', answer: '眼鏡', hint: '戴在鼻樑上幫助看清楚' },
  { id: 'daily-backpack', category: 'daily-life', answer: '背包', hint: '背在肩上裝書本或旅行用品' },
  { id: 'daily-camera', category: 'daily-life', answer: '相機', hint: '按下快門可以留下影像' },
  { id: 'daily-key', category: 'daily-life', answer: '鑰匙', hint: '插進鎖孔可以開門的金屬用品' },
  { id: 'daily-soap', category: 'daily-life', answer: '肥皂', hint: '洗手或洗澡時用來搓出泡泡' },
  { id: 'daily-bicycle', category: 'daily-life', answer: '腳踏車', hint: '用腳踩踏板前進的兩輪交通工具' },
  { id: 'daily-pillow', category: 'daily-life', answer: '枕頭', hint: '睡覺時讓頭靠著的柔軟用品' },
  { id: 'place-airplane', category: 'places', answer: '飛機', hint: '在天空中載著乘客快速旅行' },
  { id: 'place-train', category: 'places', answer: '火車', hint: '沿著鐵軌行駛的長形交通工具' },
  { id: 'place-lighthouse', category: 'places', answer: '燈塔', hint: '海邊高塔會用燈光指引船隻' },
  { id: 'place-hospital', category: 'places', answer: '醫院', hint: '生病或受傷時看醫生的地方' },
  { id: 'place-school', category: 'places', answer: '學校', hint: '學生每天上課和學習的地方' },
  { id: 'place-bridge', category: 'places', answer: '橋', hint: '跨過河流或道路，讓人車通行' },
  { id: 'place-castle', category: 'places', answer: '城堡', hint: '有高塔和城牆的古老建築' },
  { id: 'place-bus', category: 'places', answer: '公車', hint: '有固定路線、可以載很多乘客' },
  { id: 'place-library', category: 'places', answer: '圖書館', hint: '可以借閱書籍、安靜閱讀的地方' },
  { id: 'place-traffic-light', category: 'places', answer: '紅綠燈', hint: '路口用紅黃綠燈號指揮交通' },
  { id: 'nature-rainbow', category: 'nature', answer: '彩虹', hint: '下雨後天空中出現的七彩弧線' },
  { id: 'nature-volcano', category: 'nature', answer: '火山', hint: '有時會噴出熔岩和火山灰的山' },
  { id: 'nature-snowman', category: 'nature', answer: '雪人', hint: '用雪堆成，常戴著帽子和圍巾' },
  { id: 'nature-lightning', category: 'nature', answer: '閃電', hint: '暴風雨時天空瞬間亮起的電光' },
  { id: 'nature-cactus', category: 'nature', answer: '仙人掌', hint: '身上有刺、很耐旱的植物' },
  { id: 'nature-moon', category: 'nature', answer: '月亮', hint: '夜晚掛在天空，形狀會逐漸變化' },
  { id: 'nature-sunflower', category: 'nature', answer: '向日葵', hint: '黃色花朵常朝著太陽生長' },
  { id: 'nature-cloud', category: 'nature', answer: '雲', hint: '飄在天空中，有時會帶來雨水' },
  { id: 'nature-waterfall', category: 'nature', answer: '瀑布', hint: '河水從高處向下急流而成的景色' },
  { id: 'nature-sandcastle', category: 'nature', answer: '沙堡', hint: '在海邊用濕沙堆成的建築' },
]

export const DRAW_GUESS_PEN_COLORS = [
  { value: '#302d42', label: '深紫' },
  { value: '#e45167', label: '紅色' },
  { value: '#f28a36', label: '橘色' },
  { value: '#e0b92f', label: '黃色' },
  { value: '#40a879', label: '綠色' },
  { value: '#3986d7', label: '藍色' },
  { value: '#9a62c9', label: '紫色' },
  { value: '#5b6678', label: '灰色' },
] as const

export type DrawGuessPhase = 'answering' | 'drawing' | 'guessing' | 'reveal'

export interface DrawGuessSettings {
  drawTimeSeconds: number
  roundsPerPlayer: number
  guessTimeSeconds: number
  questionMode: DrawGuessQuestionMode
  questionCategory: DrawGuessQuestionCategory
}

export interface DrawGuessView {
  gameId: 'draw-guess'
  phase: DrawGuessPhase
  round: number
  roundsPerPlayer: number
  turnNumber: number
  totalTurns: number
  drawerId: string
  phaseEndsAt: number
  answer: string | null
  answerLength: number | null
  hint: string | null
  settings: DrawGuessSettings
  correctPlayerIds: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isDrawGuessQuestionCategory(value: unknown): value is DrawGuessQuestionCategory {
  return DRAW_GUESS_QUESTION_CATEGORIES.some((category) => category.id === value)
}

export function isDrawGuessSettings(value: unknown): value is DrawGuessSettings {
  return (
    isRecord(value) &&
    Number.isInteger(value.drawTimeSeconds) &&
    Number(value.drawTimeSeconds) >= 15 &&
    Number(value.drawTimeSeconds) <= 180 &&
    Number.isInteger(value.roundsPerPlayer) &&
    Number(value.roundsPerPlayer) >= 1 &&
    Number(value.roundsPerPlayer) <= 5 &&
    Number.isInteger(value.guessTimeSeconds) &&
    Number(value.guessTimeSeconds) >= 10 &&
    Number(value.guessTimeSeconds) <= 120 &&
    (value.questionMode === 'free' || value.questionMode === 'bank') &&
    isDrawGuessQuestionCategory(value.questionCategory)
  )
}

export function isDrawGuessView(value: unknown): value is DrawGuessView {
  return (
    isRecord(value) &&
    value.gameId === 'draw-guess' &&
    ['answering', 'drawing', 'guessing', 'reveal'].includes(String(value.phase)) &&
    Number.isInteger(value.round) &&
    typeof value.roundsPerPlayer === 'number' &&
    Number.isInteger(value.turnNumber) &&
    Number.isInteger(value.totalTurns) &&
    typeof value.drawerId === 'string' &&
    typeof value.phaseEndsAt === 'number' &&
    (value.answer === null || typeof value.answer === 'string') &&
    (value.answerLength === null || (Number.isInteger(value.answerLength) && Number(value.answerLength) >= 0)) &&
    (value.hint === null || typeof value.hint === 'string') &&
    isDrawGuessSettings(value.settings) &&
    Array.isArray(value.correctPlayerIds) &&
    value.correctPlayerIds.every((playerId) => typeof playerId === 'string')
  )
}
