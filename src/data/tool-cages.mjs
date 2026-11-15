/**
 * Подбор клетки по размеру.
 *
 * Размеры — МИНИМУМЫ из открытых источников, в сантиметрах: длина × ширина × высота.
 * «Больше — лучше» относится ко всем. Единого государственного норматива для
 * большинства видов нет, источники расходятся на несколько сантиметров —
 * мы берём тот, что открыли и проверили, и честно пишем, откуда он.
 *
 * Не добавляй вид без проверенного источника.
 */

export const SOURCES = {
  vcaSmall: {
    title: 'Housing Small Birds',
    publisher: 'VCA Animal Hospitals',
    url: 'https://vcahospitals.com/know-your-pet/housing-small-birds',
  },
  vcaLarge: {
    title: 'Housing Large Birds',
    publisher: 'VCA Animal Hospitals',
    url: 'https://vcahospitals.com/know-your-pet/housing-large-birds',
  },
  vcaChinchilla: {
    title: 'Chinchillas: Housing',
    publisher: 'VCA Animal Hospitals',
    url: 'https://vcahospitals.com/know-your-pet/chinchillas---housing',
  },
  rspcaAuGp: {
    title: 'Where should I keep my guinea pigs?',
    publisher: 'RSPCA Australia, Knowledgebase',
    url: 'https://kb.rspca.org.au/knowledge-base/where-should-i-keep-my-guinea-pigs/',
  },
  rabbitWelfare: {
    title: 'Space recommendations',
    publisher: 'Rabbit Welfare Association & Fund',
    url: 'https://rabbitwelfare.co.uk/welfare-need/space-recommendations/',
  },
  woodGreenRats: {
    title: 'Caring for rats as pets',
    publisher: 'Wood Green, The Animals Charity',
    url: 'https://woodgreen.org.uk/pet-advice/rats/caring-for-rats-as-pets/',
  },
  rspcaSolent: {
    title: 'Hamster accommodation',
    publisher: 'RSPCA Solent Branch',
    url: 'https://www.rspcasolentbranch.org.uk/?p=54537',
  },
  ourHamster: {
    title: 'Какая клетка нужна хомяку: размер дна, подстилка и колесо',
    publisher: 'Лапки Дома',
    url: '/gryzuny/kakaya-kletka-nuzhna-homyaku-razmer-napolnitel-chto-vnutri/',
  },
};

/**
 * Профили: min [длина, ширина, высота] в см. Если у вида разные цифры для разного
 * числа животных — несколько вариантов в variants.
 *   floorOnly: true — высота не нормируется источником (проверяем только дно).
 */
export const PROFILES = [
  {
    id: 'homyak-siriyskiy',
    group: 'Хомяки',
    title: 'Сирийский хомяк',
    variants: [{ label: 'один хомяк', min: [100, 50, null] }],
    note: 'Минимум — свободное дно без перегородок. Подстилка не менее 15 см (RSPCA Solent), наша статья называет ориентир 15–20 см и больше. Живёт один.',
    source: 'rspcaSolent',
    extra: ['ourHamster'],
  },
  {
    id: 'homyak-karlik',
    group: 'Хомяки',
    title: 'Карликовый хомяк (джунгарский и др.)',
    variants: [{ label: 'один хомяк', min: [70, 40, null] }],
    note: 'Единого норматива нет; цифра взята из нашей статьи, которая опирается на разные рекомендации. RSPCA Solent для карликовых хомяков размеров не называет.',
    source: 'ourHamster',
  },
  {
    id: 'svinka',
    group: 'Морские свинки',
    title: 'Морская свинка',
    variants: [{ label: 'пара свинок', min: [200, 50, 30] }],
    note: 'Минимум RSPCA Australia для пары: 2 × 0,5 м, высота от 30 см, прямоугольная форма лучше квадратной. Для одной свинки норматива в источнике нет, но свинкам лучше жить парой. Больше пространства — лучше.',
    source: 'rspcaAuGp',
  },
  {
    id: 'krolik',
    group: 'Кролики',
    title: 'Кролик',
    variants: [
      { label: 'пара кроликов', min: [300, 200, 100] },
      { label: 'один кролик (те же размеры)', min: [300, 200, 100] },
    ],
    note: 'Rabbit Welfare Association: минимум 3 × 2 × 1 м одним непрерывным пространством, плюс спальное место не меньше 1,8 × 0,6 × 0,6 м. Платформы, туннели и второй этаж домика в площадь не засчитываются. Клетка-«домик» не может быть единственным жильём. Для одного кролика размеры те же, но лучше держать их парой.',
    source: 'rabbitWelfare',
  },
  {
    id: 'krysa',
    group: 'Крысы',
    title: 'Декоративная крыса',
    variants: [
      { label: 'до четырёх крыс', min: [80, 50, 80] },
      { label: 'до десяти крыс', min: [93, 63, 123] },
    ],
    note: 'Wood Green: расстояние между прутьями не более 1 см. Размер дан как ширина × глубина × высота. Крысы стайные, идеальная группа — три и больше; отдельного минимума для пары в источнике нет.',
    source: 'woodGreenRats',
  },
  {
    id: 'shinshilla',
    group: 'Шиншиллы',
    title: 'Шиншилла',
    variants: [
      { label: 'одна шиншилла', min: [91, 61, 91] },
      { label: 'пара шиншилл', min: [91, 61, 152] },
    ],
    note: 'VCA: 3 × 2 × 3 фута для одной и 3 × 2 × 5 футов для пары (переведено в см), клетка в несколько уровней. Цинковое покрытие и оцинкованная сетка опасны, часть дна лучше закрыть сплошным материалом.',
    source: 'vcaChinchilla',
  },
  {
    id: 'volnistyy',
    group: 'Попугаи',
    title: 'Волнистый попугай, канарейка, зяблик',
    variants: [{ label: 'одна птица (минимум)', min: [30, 30, 60] }],
    note: 'VCA называет это минимумом. Для пары и для птицы, которая живёт в клетке постоянно, берите заметно просторнее: птице нужно махать крыльями и перелетать. Прутья должны быть такими, чтобы птица не просунула голову и лапы.',
    source: 'vcaSmall',
  },
  {
    id: 'korella',
    group: 'Попугаи',
    title: 'Корелла, неразлучник, попугайчик',
    variants: [{ label: 'одна птица (минимум)', min: [60, 60, 90] }],
    note: 'VCA называет минимумом 2 × 2 × 3 фута. Для пары берите больше.',
    source: 'vcaSmall',
  },
  {
    id: 'konur',
    group: 'Попугаи',
    title: 'Аратинга (попугаи-конюры), каик, сенегальский попугай',
    variants: [{ label: 'одна птица (минимум)', min: [90, 90, 90] }],
    note: 'VCA называет минимумом 3 × 3 × 3 фута.',
    source: 'vcaSmall',
  },
  {
    id: 'zhako-amazon',
    group: 'Попугаи',
    title: 'Жако и амазон',
    variants: [{ label: 'одна птица (минимум)', min: [90, 90, 120] }],
    note: 'VCA: серому попугаю и амазону — не меньше 3 × 3 × 4 фута.',
    source: 'vcaLarge',
  },
  {
    id: 'kakadu-malyy',
    group: 'Попугаи',
    title: 'Какаду малых видов',
    variants: [{ label: 'одна птица (минимум)', min: [60, 91, 122] }],
    note: 'VCA: 2 × 3 × 4 фута для малых видов какаду.',
    source: 'vcaLarge',
  },
  {
    id: 'kakadu-krupnyy',
    group: 'Попугаи',
    title: 'Какаду крупных видов',
    variants: [{ label: 'одна птица (минимум)', min: [122, 122, 122] }],
    note: 'VCA: 4 × 4 × 4 фута для крупных видов какаду.',
    source: 'vcaLarge',
  },
  {
    id: 'ara-malyy',
    group: 'Попугаи',
    title: 'Ара малых видов',
    variants: [{ label: 'одна птица (минимум)', min: [91, 91, 122] }],
    note: 'VCA: малые ара (суровый, жёлтоворотничковый, Хана) — 3 × 3 × 4 фута.',
    source: 'vcaLarge',
  },
  {
    id: 'ara-krupnyy',
    group: 'Попугаи',
    title: 'Ара крупных видов',
    variants: [{ label: 'одна птица (минимум)', min: [122, 152, 152] }],
    note: 'VCA: синежёлтый, красный, зелёнокрылый ара и гиацинтовый — 4 × 5 × 5 футов.',
    source: 'vcaLarge',
  },
];

export const FAQ = [
  {
    q: 'Почему размеры отличаются от того, что написано на упаковке клетки из магазина?',
    a: 'Производители указывают размеры, удобные для продажи, а не нормы благополучия животного. Мы показываем минимумы ветеринарных и зоозащитных организаций. У хомяка, кролика, крысы и многих попугаев магазинные клетки часто оказываются меньше.',
  },
  {
    q: 'Это обязательные нормы?',
    a: 'Нет. Для домашних питомцев в России единых государственных нормативов на размер клетки нет. Это рекомендации организаций, которые занимаются здоровьем и благополучием животных, и источники иногда расходятся на несколько сантиметров. Всегда лучше, если клетка больше минимума.',
  },
  {
    q: 'Как мерить клетку: по внешним размерам или по дну?',
    a: 'По свободному пространству внутри. Для хомяка важна площадь дна без перегородок, для кролика единое непрерывное пространство, платформы и туннели не засчитываются. Высоту мерьте от пола клетки до потолка.',
  },
  {
    q: 'Что, если нужного вида нет в списке?',
    a: 'Значит, мы не нашли для него подтверждённого источника. Размер для такого животного лучше уточнить у ветеринарного врача, который работает с этим видом, или в профильных организациях.',
  },
];
