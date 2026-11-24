// The decorative letters next to each screen title. The Japanese label is the source; the two
// Chinese styles (v0.16.0) show their own word in simplified Chinese, chosen 2026-11-24.
// Rule (CLAUDE.md): these letters appear only in screen titles.

export const CN_TITLES = {
  今: '今天', 思い出: '回忆', 券: '券', 手紙: '情书', もっと: '更多', 二人: '我们',
  カレンダー: '日历', 記念日: '纪念日', バッジ: '徽章', 当たり: '刮奖', 気分: '心情', 年間: '年度',
  お知らせ: '提醒', 次回: '下次', 写真: '照片', アルバム: '相册', 地図: '地图', 初めて: '第一次',
  タイムカプセル: '时光胶囊', プリクラ: '大头贴', 日記: '日记', 声: '声音', クイズ: '问答', 愛: '爱',
  感謝: '感恩', 挑戦: '挑战', 習慣: '习惯', 歌: '歌曲', 願い: '心愿', 夢: '梦想', デート: '约会',
  お出かけ: '出游', 映画: '电影', 三十日: '三十天', 贈り物: '礼物', 遊び: '游戏', リーグ: '联赛',
  時間: '时光', 季節: '节日', ペット: '宠物', 貯金: '存钱', 家計: '家用', リスト: '清单', レシピ: '食谱',
  庭: '花园', 自分: '自己', 設定: '设置', 情報: '资料', 夜: '夜',
};

/** What to show for a Japanese title label in a style: { text, lang }. */
export function titleLetters(jp, style = document.documentElement.dataset.style) {
  if ((style === 'rojo' || style === 'azul') && CN_TITLES[jp]) return { text: CN_TITLES[jp], lang: 'zh-Hans' };
  return { text: jp, lang: 'ja' };
}

/** Every Chinese character the styles draw (titles, lantern and seal words): the font subset. */
export const CN_GLYPHS = [...new Set(Object.values(CN_TITLES).join('') + '福爱我你喜春')].join('');
