#!/usr/bin/env node
/**
 * Загружает настоящие фотографии животных с Wikimedia Commons и подставляет их
 * как обложки статей вместо нарисованных SVG-заглушек.
 *
 * Почему именно Commons: там у каждого файла указана лицензия и автор, которые
 * можно проверить и показать на сайте. Брать картинки из поиска или скриншоты
 * с чужих видео нельзя — это чужая собственность и риск претензий.
 *
 * Лицензии CC BY / CC BY-SA требуют указания авторства — скрипт записывает автора,
 * лицензию и ссылку на источник в frontmatter (coverCredit), а шаблон статьи
 * показывает их подписью под фотографией.
 *
 * Использование:
 *   node scripts/fetch-photos.mjs                 # только статьи без фото
 *   node scripts/fetch-photos.mjs --force         # перезагрузить все
 *   node scripts/fetch-photos.mjs slug1 slug2     # перезагрузить конкретные
 *   node scripts/fetch-photos.mjs --sets          # галереи + ленты категорий
 *   node scripts/fetch-photos.mjs --sets slug1    # галерея только этой статьи
 *
 * Обложки и наборы не пересекаются: с флагом --sets обложки не трогаются вовсе,
 * а перечисленные слаги ограничивают набор — ленты категорий тогда пропускаются.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARTICLES_DIR = path.join(ROOT, 'src/content/articles');
const OUT_DIR = path.join(ROOT, 'public/images/photos');
const FORCE = process.argv.includes('--force');
// --sets = режим наборов (галереи и ленты категорий), обложки при нём не трогаются.
const SETS = process.argv.includes('--sets');
// --breeds = только справочник пород (страницы /porody/koshki и /porody/sobaki).
const BREEDS = process.argv.includes('--breeds');
// Явно перечисленные slug-и перезагружаем, даже если фото уже стоит.
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('--'));

// Wikimedia требует осмысленный User-Agent с контактом, иначе блокирует запросы.
// Домен куплен 27.07.2026, почта владельца задана 29.07.2026 — актуально.
const UA = 'LapkiDomaBot/1.0 (https://lapki-doma.ru; andr3y2065@yandex.ru)';

/**
 * Какое фото искать для какой статьи. Запросы — по-английски: по русским
 * Commons часто возвращает случайные снимки.
 *
 * ⚠️ Запрос описывает СПОКОЙНУЮ сцену, а не симптом. Читатель приходит
 * встревоженным, и фото рвоты или расчёсанной до крови кожи пугает вместо
 * того, чтобы помочь (правило «ничего пугающего» из CLAUDE.md). Поэтому
 * для статьи про рвоту ищем осмотр у ветеринара, для зуда — обычную собаку.
 *
 * Добавил статью — допиши сюда строку и прогони скрипт.
 */
const PHOTO_QUERIES = {
  // Кошки
  'kak-priuchit-kotenka-k-lotku': 'Litter box cat',
  'koshka-i-zakon-soderzhanie-samovygul': 'Domestic cat sitting in garden',
  'koshka-deret-mebel-kak-otuchit-bez-nakazaniya': 'Cat scratching post',
  'porody-koshek-dlya-semi-s-rebenkom': 'Cat sleeping on blanket',
  // Портреты пород. Запрос отличается от того, что стоит в галерее подборки,
  // иначе на обложке и в галерее оказалось бы одно и то же фото.
  'meyn-kun-harakter-uhod-i-osobennosti-porody': 'Maine Coon cat face tufted ears',
  'britanskaya-koshka-harakter-uhod-osobennosti': 'British Shorthair kitten',
  'kak-priuchit-koshku-k-perenoske-bez-stressa': 'Cat in travel carrier',
  'shotlandskaya-vislouhaya-harakter-uhod-osobennosti': 'Scottish Fold',
  'sfinks-harakter-uhod-i-osobennosti-porody': 'Sphynx cat',
  'koshka-kusaet-kogda-gladish-pochemu': 'Cat cuddling with owner',
  'regdoll-harakter-uhod-i-osobennosti-porody': 'Ragdoll cat lying',
  'sibirskaya-koshka-harakter-uhod-osobennosti': 'Siberian cat breed',
  'koshka-gromko-myaukaet-po-nocham-chto-delat': 'Cat sitting windowsill',
  'bengalskaya-koshka-harakter-uhod-osobennosti': 'Bengal cat spotted portrait',
  'siamskaya-koshka-harakter-uhod-osobennosti': 'Seal point Siamese cat short hair',
  'birmanskaya-koshka-harakter-uhod-osobennosti': 'Birman cat portrait',
  // ⚠️ Подобрано вручную (Stefan Ivanov, Grouchy Persian cat) — автозапрос давал
  // экстремальный кроп на один глаз, где не видно приплюснутой морды породы.
  'persidskaya-koshka-harakter-uhod-osobennosti': 'Grouchy Persian cat',
  'abissinskaya-koshka-harakter-uhod-osobennosti': 'Abyssinian cat',
  'russkaya-golubaya-koshka-harakter-uhod-osobennosti': 'Russian Blue cat portrait',
  'koshku-rvet-shersyu-eto-norma-ili-net': 'Cat grooming licking fur',
  'koshka-boitsya-pylesosa-i-bytovoy-shum': 'Cat sitting on carpet',
  'kot-metit-ugly-pochemu-i-chto-delat': 'Cat sitting next to door',
  'koshka-prinosit-domoy-myshey-i-ptic': 'Cat crouched in grass',
  // ⚠️ Обложка подобрана вручную (Öljylautta, Grey cat eating.jpg) — запрос
  // «Cat eating cat food» неожиданно первым кандидатом отдавал PD-фото
  // пластиковых столовых приборов (Scott Bauer), а не кошку. Прогон скрипта
  // по этому слагу заменит фото — сверяться с public/images/photos глазами.
  'chem-kormit-koshku-suhoy-korm-ili-naturalnaya-eda': 'Cat eating cat food',
  // ⚠️ Обложка подобрана вручную (Roc0ast3r, Cat staring out window) — автозапросы
  // либо ничего не находили, либо повторно отдавали то же фото, что уже стоит в
  // «kuda-det-pitomca-v-otpuske» ('Cat looking out window (2023-08-27)'). Прогон
  // скрипта по этому слагу заменит фото — сверяться с public/images/photos глазами.
  'kak-ponyat-chto-koshke-skuchno': 'Grey cat lying on carpet bored',
  // ⚠️ Обложка подобрана вручную (Famartin, Tabby cat lying on a bed) — первый
  // автонайденный кандидат («Cat resting on a couch», Unsplash/CC0) уже занят
  // сразу двумя другими статьями («pervyy-den-schenka-ili-kotenka-doma…» и
  // черновая версия этой самой статьи) — дубль поймали только сверкой sourceUrl
  // по всем статьям. Прогон скрипта по этому слагу заменит фото — сверяться
  // с public/images/photos глазами и проверять на дубли с другими статьями.
  'sterilizaciya-koshki-kogda-delat-i-chto-posle': 'Tabby cat resting on cushion',
  'koshka-topchet-lapkami-chto-oznachaet-eto-povedenie': 'Cat kneading blanket',
  'kot-pryachetsya-i-ne-vyhodit-iz-ukrytiya': 'Cat under bed hiding',
  'koshka-agressivna-k-drugoy-koshke-v-dome': 'Two cats sitting together',

  // Собаки
  'potencialno-opasnye-porody-sobak': 'American Staffordshire Terrier',
  'pravila-vygula-sobaki-po-zakonu': 'Dog walking on leash park',
  'schenok-skulit-po-nocham-pervuyu-nedelyu-posle-pereezda': 'Beagle puppy sleeping',
  'sobaka-dlya-kvartiry-kakie-porody-podhodyat': 'Dog sleeping on couch',
  'francuzskiy-buldog-harakter-uhod-zdorovye': 'French Bulldog puppy',
  'taksa-harakter-uhod-i-osobennosti-porody': 'Dachshund puppy',
  'sobaka-tyanet-povodok-kak-otuchit': 'Dog pulling on leash',
  'shi-tcu-harakter-uhod-i-osobennosti-porody': 'Shih Tzu puppy',
  'labrador-retriver-harakter-uhod-osobennosti': 'Labrador Retriever dog sitting',
  'sobaka-ne-podhodit-na-zov-kak-nauchit': 'Dog running on grass',
  'mops-harakter-uhod-i-osobennosti-porody': 'Pug dog',
  'kavaler-king-charlz-spaniel-harakter-i-uhod': 'Cavalier King Charles Spaniel puppy',
  'schenok-kusaet-ruki-v-igre-kak-otuchit': 'Puppy chewing toy',
  // ⚠️ Подобрано вручную (Tim Dobbelaere, German Shepherd Dog sitting leash.jpg) —
  // автозапрос давал только фото с выставок (ленты, кубки, суетливый фон).
  'nemeckaya-ovcharka-harakter-uhod-osobennosti': 'German Shepherd Dog sitting leash',
  'yorkshirskiy-terer-harakter-uhod-osobennosti': 'Yorkshire Terrier dog outdoor',
  'chihuahua-harakter-uhod-osobennosti': 'Chihuahua dog face',
  'pomeranskiy-shpic-harakter-uhod-osobennosti': 'Pomeranian dog outdoor',
  'sibirskiy-haski-harakter-uhod-osobennosti': 'Siberian Husky dog pet',
  'dzhek-rassel-terer-harakter-uhod-osobennosti': 'Jack Russell Terrier pet',
  'kak-podgotovit-pitomca-k-pereezdu': 'Cat in cardboard box moving',
  'sobaka-gryzet-mebel-i-obuv-doma': 'Puppy sneaker',
  'sobaka-voet-na-sireny-muzyku-i-drugie-zvuki': 'Dog howling',
  'kak-poznakomit-sobaku-s-novorozhdennym-rebenkom': 'Newborn baby with dog',
  'sobaka-est-travu-na-progulke': 'Dog in green grass park walk',
  'sobaka-drozhit-chastye-prichiny-i-kogda-eto-trevozhno': 'Chihuahua dog portrait',

  // Грызуны
  // Овощи, а не хомяк: найденное фото хомяка с белым хлебом противоречило
  // самой статье — она как раз про то, чего давать нельзя.
  'chem-kormit-homyaka-chto-mozhno-i-chto-nelzya': 'Vegetables carrot cucumber broccoli',
  'homyak-kusaetsya-kogda-beresh-na-ruki-pochemu-i-chto-delat': 'Hamster in human hands',
  'homyak-shumit-nochyu-pochemu-i-kak-umenshit-shum': 'Hamster running wheel',
  'kakaya-kletka-nuzhna-homyaku-razmer-napolnitel-chto-vnutri': 'Hamster cage bedding',
  'kakoy-gryzun-podoydet-rebenku-homyak-morskaya-svinka-ili-krysa': 'Guinea pig portrait',
  'chem-kormit-morskuyu-svinku-seno-vitamin-c-i-zaprety': 'Guinea pigs eating lettuce',
  'dekorativnaya-krysa-kto-eto-i-chto-ey-nuzhno': 'Pet rat on hand',
  'dzhungarskiy-homyak-kto-eto-i-chto-emu-nuzhno': 'Djungarian hamster',
  'homyak-sbezhal-iz-kletki-kak-nayti': 'Pet hamster',
  'siriyskiy-homyak-kto-eto-i-chto-emu-nuzhno': 'Golden hamster',
  'morskaya-svinka-kto-eto-i-chto-ey-nuzhno': 'Guinea pig on grass',
  'homyak-gryzet-prutya-kletki-pochemu-i-chto-delat': 'Syrian hamster cage',
  'dekorativnyy-krolik-kto-eto-i-chto-emu-nuzhno': 'Holland Lop rabbit pet',
  'shinshilla-kto-eto-i-chto-ey-nuzhno': 'Chinchilla pet',
  'zapah-ot-kletki-gryzuna-kak-ubrat': 'Guinea pig cage',
  'mozhno-li-derzhat-vmeste-dvuh-gryzunov': 'Two guinea pigs together',
  'pochemu-homyak-nabivaet-shchyoki-i-pryachet-edu': 'Hamster cheek pouch food',
  'mozhno-li-kupat-homyaka-svinku-ili-shinshillu': 'Napoleon chinchilla in box',
  'homyak-ili-morskaya-svinka-vyalye-kak-ponyat-chto-chto-to-ne-tak': 'Guinea pig in hay',

  // Попугаи
  'volnistyy-popugay-kto-eto-i-chto-emu-nuzhno': 'Budgerigar pet bird',
  'korella-kto-eto-i-chto-ey-nuzhno': 'Cockatiel bird',
  'nerazluchniki-kto-eto-i-chto-im-nuzhno': 'Lovebird parrot pair',
  // Первый кадр (Papooga, огурец) совпал с фото в ленте категории «Попугаи».
  // Второй запрос («Congo African grey parrot pet portrait») дал кадр без
  // хвоста — для статьи про жако нужен виден именно красный хвост.
  'zhako-kto-eto-i-chto-emu-nuzhno': 'African grey parrot red tail perched',
  'ozherelovyy-popugay-kto-eto-i-chto-emu-nuzhno': 'Rose-ringed parakeet',
  'kakaya-kletka-nuzhna-popugayu': 'Bird cage with parrot',
  // ⚠️ Обложка подобрана вручную (Leintalzoo, попугай ест дольку апельсина) —
  // ни один автоматический запрос не находил кадр именно кормления без
  // медовой палочки/проса на палочке. Прогон скрипта по этому слагу заменит
  // фото на менее подходящее — сверяться с public/images/photos глазами.
  'chem-kormit-volnistogo-popugaya': 'Budgerigar parakeet eating',
  // ⚠️ Обложка подобрана вручную (Dawnseeker2000, два попугая на верёвочной
  // жёрдочке на фоне шторы) — ни один текстовый запрос не находил спокойный
  // домашний кадр вне клетки. Прогон скрипта по этому слагу заменит фото —
  // сверяться с public/images/photos глазами.
  'bezopasnaya-kvartira-dlya-popugaya': 'Budgerigar pet room chair',
  // «Parrot on human hand» и «sitting on finger hand» ничего не нашли.
  'kak-priruchit-popugaya-k-rukam': 'Budgerigar perched on finger',
  // «Parrot head close up» вернул портрет пуэрториканского амазона — редкого
  // охраняемого вида, который дома не держат. Ищем портрет обычной ручной птицы.
  'kak-nauchit-popugaya-govorit': 'African grey parrot portrait pet',
  // ⚠️ Подобрано вручную (Slipperymonkey44, Budgie preening.JPG) — птица должна быть
  // здоровой, с целым оперением, а не показывать сам симптом (оголённые участки).
  'popugay-vyschipyvaet-perya-pochemu': 'Budgie preening',
  'kakadu-kto-eto-i-chto-emu-nuzhno': 'Cacatua alba',
  'ara-kto-eto-i-chto-emu-nuzhno': 'Macaw parrot pet',
  'kvaker-kto-eto-i-chto-emu-nuzhno': 'Monk parakeet pet',
  'aleksandriyskiy-popugay-kto-eto-i-chto-emu-nuzhno': 'Alexandrine parakeet pet',
  'senegalskiy-popugay-kto-eto-i-chto-emu-nuzhno': 'Senegal parrot pet',
  'amazon-popugay-kto-eto-i-chto-emu-nuzhno': 'Amazon parrot pet',
  'rozella-kto-eto-i-chto-ey-nuzhno': 'Eastern rosella bird',
  'popugay-postoyanno-krichit-pochemu-i-kak-uspokoit': 'Budgerigar in cage home',
  'mozhno-li-kupat-popugaya': 'Budgerigar bathing',
  // ⚠️ Обложка подобрана вручную (Alana Elliott, Budgerigar -4.jpg — сидит
  // нахохлившись, спокойная домашняя обстановка) — автозапросы находили либо
  // сканы орнитологических журналов, либо игровой комплекс без намёка на позу.
  // Прогон скрипта по этому слагу заменит фото — сверяться с public/images/photos глазами.
  'popugay-nahohlilsya-i-molchit-kogda-stoit-nastorozhitsya': 'Budgerigar bird perched cage home',
  'lori-kto-eto-i-chto-emu-nuzhno': 'Rainbow lorikeet pet bird',
  'kaik-kto-eto-i-chto-emu-nuzhno': 'Black-headed caique parrot pet',

  // Здоровье и поведение
  'koshka-ne-est-skolko-mozhno-zhdat-i-chto-delat': 'Cat food bowl',
  'pitomec-silno-linyaet-gde-norma-a-gde-povod-nastorozhitsya': 'Grooming dog with brush',
  'rvota-u-koshki-kogda-ponablyudat-a-kogda-k-vrachu': 'Cat resting on floor',
  'sobaka-boitsya-grozy-i-salyutov-kak-pomoch': 'Dog lying under chair',
  // Обложка не обязана показывать сам симптом: спокойная собака уместнее
  // и не пугает читателя, который и так встревожен.
  'sobaka-cheshetsya-a-bloh-net-chastye-prichiny': 'Golden Retriever portrait',
  'sobaka-otkazyvaetsya-ot-edy-kogda-eto-trevozhno': 'Dog food bowl',
  // Спокойный кот рядом с лотком, а не сам «промах» — пугать читателя нечем.
  'kot-pisaet-mimo-lotka-chastye-prichiny-i-kogda-eto-srochno': 'Cat litter box',
  'koshka-dyshit-s-otkrytym-rtom-kogda-eto-srochno': 'Cat resting on bed',
  'ponos-u-sobaki-kogda-nablyudat-a-kogda-k-vrachu': 'Labrador Retriever lying on grass',
  'sobaka-hromaet-kogda-zhdat-nelzya': 'Dog lying on grass resting',
  'sobaka-ili-koshka-chasto-chihaet-kogda-eto-norma': 'Black cat sniffing a flower',
  'nepriyatnyy-zapah-izo-rta-u-koshki-ili-sobaki': 'Dog open mouth teeth',
  'koshka-ili-sobaka-stala-mnogo-pit-vody-kogda-eto-povod-nastorozhitsya': 'Dog drinking water bowl',

  // Советы
  'pitomec-prichinil-vred-otvetstvennost-vladelca': 'Cat and dog lying together',
  'sobaka-v-mnogokvartirnom-dome-prava-sosedey': 'Dog resting on sofa',
  'pervyy-den-schenka-ili-kotenka-doma-chto-podgotovit': 'Kitten sofa',
  'kak-vybrat-veterinarnuyu-kliniku': 'Veterinarian with cat clinic',
  'nashli-kotenka-na-ulice-chto-delat': 'Kitten in grass',
  'kuda-det-pitomca-v-otpuske': 'Cat looking out of window',
  'pervaya-pomoshch-pri-ukuse-ili-carapine-ot-pitomca': 'Bandaging hand wound',
  'kak-vvesti-novogo-pitomca-v-dom-s-koshkoy-ili-sobakoy': 'Cat and Dog Cuddling',
  'skolko-stoit-soderzhanie-koshki-ili-sobaki-v-mesyac': 'Dog and cat friends',
  'pitomec-poteryalsya-chto-delat-v-pervye-chasy': 'Dog standing on street',
  'nuzhna-li-privivka-ot-beshenstva-i-kak-chasto-ee-delat': 'Golden Retriever dog sitting park',
  // ⚠️ Обложка подобрана вручную (Delusion23, Cat with microchip implant.JPG —
  // чёрная кошка с биркой «protected by a microchip, scan me») — автозапросы
  // либо возвращали рентген-снимок с чипом, либо снимок иглы/шприца крупным
  // планом (нарушает правило «без игл»), либо архивные PDF законов о чипировании.
  // Прогон скрипта по этому слагу заменит фото — сверяться с public/images/photos глазами.
  'nuzhno-li-chipirovat-pitomca': 'Cat with microchip implant',
  // ⚠️ Обложка подобрана вручную (WinterCHEDDER, Two European Shorthairs.jpg —
  // две кошки обнимаются в одной лежанке). Запрос «Cat and dog lying together»
  // возвращал File:Cat_and_dog.JPG — то же фото уже стоит в
  // «pitomec-prichinil-vred-otvetstvennost-vladelca» (дубль поймали сверкой
  // sourceUrl). Другие запросы про игру котят выглядели как драка, а не дружба.
  // Прогон скрипта по этому слагу заменит фото — сверяться с public/images/photos глазами.
  'stoit-li-zavodit-vtorogo-pitomca-kak-ponyat-chto-semya-gotova': 'Two European Shorthairs cat cuddling',
  // ⚠️ Обложка подобрана вручную (Famartin, калико кошка на подоконнике внутри
  // дома смотрит в окно) — запрос «Cat sitting on windowsill» отдавал файл,
  // который уже стоит в «koshka-gromko-myaukaet-po-nocham-chto-delat»
  // (File:Cat_-_Groningen,_Netherlands_-_29_August_2020.jpg) — дубль поймали
  // сверкой sourceUrl. Прогон скрипта по этому слагу заменит фото — сверяться
  // с public/images/photos глазами и проверять на дубли.
  'mozhno-li-ostavlyat-pitomca-odnogo-doma-na-celyy-den': 'Calico cat windowsill staring window Virginia',

  // Здоровье и поведение (вторая партия)
  'koshka-vilyaet-hvostom-chto-oznachayut-raznye-dvizheniya-hvosta': 'Ginger cat tail raised walking',
  // ⚠️ Обложка подобрана вручную (Slyronit, Beagle licking her paws.jpg — бигль
  // на кровати вылизывает лапу, спокойный домашний кадр). Поиск по этому запросу
  // непостоянен: тот же текст один раз отдавал этот файл, в другой раз —
  // File:Dog_licking_wound.jpg (лапа с ранкой крупным планом — по названию видно,
  // что это именно повреждение, а не обычный уход). Прогон скрипта по этому
  // слагу может заменить фото на менее удачное — сверяться с public/images/photos глазами.
  'sobaka-lizhet-lapy-chastye-prichiny': 'Beagle licking her paws',
  // ⚠️ Обложка подобрана вручную (Muhammad Mahdi Karim, Domestic cat felis catus
  // itching.jpg — упитанный домашний кот чешет мордочку лапой в саду) — запрос
  // «Dog scratching ear pet»/«Dog scratching itself» отдавал худого уличного пса
  // на грязной дороге в Индии (File:Dog_scratching_itself.JPG) — не подходит для
  // сайта про уход за домашними питомцами. Прогон скрипта заменит фото — сверяться
  // с public/images/photos глазами.
  'u-koshki-ili-sobaki-cheshutsya-ushi-chastye-prichiny': 'Domestic cat itching paw face',

  // Грызуны (вторая партия)
  // ⚠️ Обложка подобрана вручную (Rex tremendae majestatis, Guinea pig pet 2.jpg —
  // спокойный портрет морской свинки крупным планом дома) — автозапросы либо
  // отдавали архивные книги про разведение свинок, либо кадр с грязной
  // фермерской клеткой на земле (не питомец, а похоже на разведение на ферме).
  // Прогон скрипта по этому слагу заменит фото — сверяться с public/images/photos глазами.
  'skolko-zhivut-homyaki-morskie-svinki-kroliki-i-krysy-sravnenie-po-vidam': 'Rex guinea pig pet',
  // ⚠️ Обложка подобрана вручную (Padaguan, Mini rex bunny.jpg — насторожённый
  // кролик с поднятыми ушами сидит на одеяле дома) — автозапросы либо отдавали
  // архивные книги о разведении кроликов на ферму, либо не находили ничего.
  // Прогон скрипта по этому слагу заменит фото — сверяться с public/images/photos глазами.
  'krolik-stuchit-zadney-lapoy-chto-eto-znachit': 'Mini rex bunny quilt',
  'kak-otlichit-samca-ot-samki-u-homyaka-ili-morskoy-svinki': 'Hamster held in hands',

  // Кошки / собаки (вторая партия)
  'koshka-chasto-spit-skolko-eto-normalno': 'Cat sleeping cozy blanket',
  'sobaka-chasto-zevaet-doma-skuka-ili-stress': 'Dog yawning',
};

/** Убирает html-теги из поля автора — Commons отдаёт его со ссылками. */
function stripHtml(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// В Commons много исторических материалов: сканы книг, гравюры, картины,
// чёрно-белые архивные снимки. Для современного сайта они не годятся —
// выглядят как низкокачественный контент. Отсекаем их.
//
// ⚠️ Проверено на практике 27.07.2026: одной EXIF-даты МАЛО. У сканов её просто
// нет, и в обложки прошли фото 1913 и 1929 года (в том числе портрет семьи
// инупиатов Эдварда Кёртиса — в статью про линьку питомцев). Поэтому год теперь
// ищется ещё и в названии файла, и отсекаются архивные коллекции по автору.
// Военные фотослужбы США — крупный источник public domain на Commons, и их
// снимки лезут в выдачу по любому бытовому запросу. Проверено: по «Dog eating
// from bowl» первым пришло фото сержанта и солдата (Sgt. 1st Class Chantell Black).
const BAD_AUTHORS =
  /internet archive book images|biodiversity heritage|edward s\.? curtis|department of (labor|the interior|defense)|library of congress|national archives|nationaal archief|bundesarchiv|state library|museum|dpla|\b(sgt|sergeant|cpl|corporal|pfc|petty officer|airman|u\.?s\.? (army|navy|air force|marine))\b/i;
const BAD_TITLE =
  /\(page|bookplate|illustration|drawing|painting|sketch|engraving|lithograph|botanical art|herbarium|\bplate\b|title page|\bdpla\b|\barchive\b|postcard|\bstereograph\b/i;

// Сайт про ДОМАШНИХ животных. Commons по запросу "dog" охотно отдаёт гиеновидную
// собаку и волка — на обложке статьи про зуд у питомца это прямая дезинформация
// (реальный случай: African Wild Dog в статью «собака чешется»).
const WILD_SPECIES =
  /\b(lycaon|african wild dog|painted dog|wolf|wolves|coyote|jackal|dingo|\bfox\b|lynx|bobcat|tiger|lion|leopard|panther|cheetah|serval|caracal|ocelot|puma|cougar|mountain lion|wildcat|hyena|raccoon|ferret|capybara|beaver|squirrel|marmot|vole|wild boar|zoo)\b/i;

// Портрет человека вместо животного — тоже частый промах поиска.
const HUMAN_SUBJECT = /\b(family|portrait of|man|woman|children|soldier|worker|tribe|people)\b/i;

// ⚠️ САМЫЙ ВАЖНЫЙ ФИЛЬТР. Проверено 27.07.2026: по запросу «Dog eating dog food»
// Commons вернул фото ТУШ ЗАБИТЫХ СОБАК на мясном рынке, а по «Dog scratching» —
// доколумбову керамическую фигурку из музея. На сайте про уход за питомцами
// первое недопустимо, второе бессмысленно. Ни один автофильтр не заменяет
// просмотр глазами, но эти две категории отсекаем жёстко.
const FORBIDDEN =
  /\b(meat|butcher|slaughter|carcass|carcase|dead|killed|kill|hunting|hunted|trophy|taxidermy|skull|skeleton|bones|roast|cooked|market stall|street food|corpse|euthan|autopsy|dissect|specimen)\b/i;

// Музейные экспонаты: керамика, статуэтки, чучела — не живые животные.
const ARTIFACT =
  /\b(ceramic|figurine|sculpture|statue|statuette|pottery|terracotta|artifact|artefact|effigy|vessel|ancient|pre-columbian|colima|mosaic|fresco|relief|carving|bronze|marble|toy|plush|stuffed)\b/i;

// Схемы и инфографика: по «Bandog» Commons отдал анатомический чертёж
// с английскими подписями вместо фотографии собаки.
const DIAGRAM =
  /\b(diagram|anatomy|anatomical|chart|labell?ed|infographic|scheme|schematic|map|logo|icon|silhouette|clipart|poster|sign)\b/i;

/** Отсеивает исторические материалы: сканы, рисунки, дореволюционные фото. */
function looksHistorical(title, author, meta) {
  if (BAD_AUTHORS.test(author)) return true;
  if (BAD_TITLE.test(title)) return true;
  // Год ищем и в EXIF, и в названии файла: у сканов EXIF-даты обычно нет.
  const date = stripHtml(meta.DateTimeOriginal?.value || meta.DateTime?.value || '');
  const exifYear = Number((date.match(/\b(1[6-9]\d{2}|20\d{2})\b/) || [])[1]);
  if (exifYear && exifYear < 1990) return true;
  const titleYear = Number((String(title).match(/\b(1[6-9]\d{2})\b/) || [])[1]);
  if (titleYear && titleYear < 1990) return true;
  return false;
}

/** Не тот вид: дикий зверь или человек вместо домашнего питомца. */
function wrongSubject(title) {
  return WILD_SPECIES.test(title) || HUMAN_SUBJECT.test(title);
}

/**
 * Кадр, которого на сайте про уход за питомцами быть не должно ни при каких
 * настройках: мясо, туши, охотничьи трофеи, чучела, музейные статуэтки.
 * В отличие от wrongSubject этот фильтр НЕ отключается флагом allowWild.
 */
function forbiddenSubject(title) {
  return FORBIDDEN.test(title) || ARTIFACT.test(title) || DIAGRAM.test(title);
}

// Лицензии, которые НЕ требуют указывать автора: общественное достояние и CC0.
// Владелец просил по возможности брать именно такие фото — тогда подпись под
// снимком нужна только из вежливости, а не по требованию лицензии.
// Мы всё равно записываем автора и источник в coverCredit: это честно и
// страхует от ошибки в определении лицензии на стороне Commons.
const NO_ATTRIBUTION_LICENSE = /public domain|\bCC0\b|\bPDM\b|no restrictions/i;

/**
 * Ищет подходящее фото в Wikimedia Commons. Возвращает url + данные лицензии.
 *
 * Из всех подходящих кандидатов выбирает первый с лицензией без обязательного
 * авторства (PD/CC0), и только если таких нет — первый по релевантности.
 *
 * allowWild отключает фильтр диких видов — он нужен ровно для волкособа:
 * это гибрид волка, он законно входит в перечень опасных пород, и общий
 * запрет на слово «wolf» здесь ложно срабатывает.
 */
async function findPhoto(query, { allowWild = false } = {}) {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: `File: ${query}`,
    gsrnamespace: '6',
    gsrlimit: '12',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|size|mime',
    iiurlwidth: '1200',
    format: 'json',
  });
  const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
    headers: { 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`Commons ответил ${res.status}`);
  const data = await res.json();
  // Порядок выдачи Commons — это релевантность, её терять не хочется:
  // складываем всех подходящих кандидатов по порядку и выбираем в конце.
  const candidates = [];
  const pages = Object.values(data?.query?.pages ?? {});

  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info) continue;
    // Только растровые фото: svg и рисунки нам не нужны.
    if (!/^image\/(jpeg|png)$/.test(info.mime || '')) continue;
    const meta = info.extmetadata ?? {};
    const license = meta.LicenseShortName?.value ?? '';
    // Отсекаем несвободные лицензии (fair use и подобное).
    if (/fair use|non-free/i.test(license)) continue;

    const author = stripHtml(meta.Artist?.value) || 'Wikimedia Commons';
    if (looksHistorical(page.title, author, meta)) continue;
    if (forbiddenSubject(page.title)) continue;
    if (!allowWild && wrongSubject(page.title)) continue;
    // Мелкие картинки на обложке 16:9 выглядят мылом.
    if ((info.width ?? 0) < 800) continue;

    candidates.push({
      url: info.thumburl || info.url,
      author,
      license: stripHtml(license) || 'CC',
      sourceUrl: info.descriptionurl || '',
      title: page.title,
    });
  }

  // Сначала — фото без обязательного указания авторства (PD/CC0),
  // и только если таких не нашлось, берём лучший из остальных.
  return candidates.find((c) => NO_ATTRIBUTION_LICENSE.test(c.license)) || candidates[0] || null;
}

/** Скачивает файл на диск. */
async function download(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Скачивание не удалось: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

/** Заменяет или добавляет поле в frontmatter. */
function setField(fm, name, value) {
  const re = new RegExp(`^${name}:.*$`, 'm');
  return re.test(fm) ? fm.replace(re, `${name}: ${value}`) : `${fm}\n${name}: ${value}`;
}

/** Экранирование для YAML-строки в одинарных кавычках. */
function yaml(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

fs.mkdirSync(OUT_DIR, { recursive: true });

// С флагом --sets занимаемся только галереями и лентами: обложки в этот заход
// не трогаем вовсе. Иначе «собери галерею статьям A и B» заодно перекачивало бы
// их проверенные глазами обложки — а откатить это нечем, пока статья не в git.
const entries = SETS ? [] : Object.entries(PHOTO_QUERIES);
let done = 0;
let skipped = 0;
const failed = [];

console.log(`Ищу фотографии для ${entries.length} статей…\n`);

for (const [slug, query] of entries) {
  const file = path.join(ARTICLES_DIR, `${slug}.md`);
  if (!fs.existsSync(file)) {
    failed.push(`${slug} — нет такой статьи`);
    continue;
  }

  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) {
    failed.push(`${slug} — битый frontmatter`);
    continue;
  }
  let [, fm, body] = m;

  const requested = ONLY.length > 0 && ONLY.includes(slug);
  if (ONLY.length > 0 && !requested) {
    skipped++;
    continue;
  }
  if (!FORCE && !requested && /^cover:\s*\/images\/photos\//m.test(fm)) {
    skipped++;
    continue;
  }

  try {
    const photo = await findPhoto(query);
    if (!photo) {
      failed.push(`${slug} — подходящее фото не найдено`);
      continue;
    }

    const ext = photo.url.toLowerCase().includes('.png') ? 'png' : 'jpg';
    const filename = `${slug}.${ext}`;
    const bytes = await download(photo.url, path.join(OUT_DIR, filename));

    fm = setField(fm, 'cover', `/images/photos/${filename}`);
    const title = (fm.match(/^title:\s*(.+)$/m)?.[1] ?? slug).replace(/^['"]|['"]$/g, '');
    fm = setField(fm, 'coverAlt', yaml(title));
    // coverCredit — вложенный объект. Удаляем сам ключ ВМЕСТЕ со всеми
    // строками с отступом под ним, иначе остаются осиротевшие author/license
    // и frontmatter перестаёт парситься.
    fm = fm.replace(/^coverCredit:[ \t]*\r?\n(?:[ \t]+\S.*\r?\n?)*/m, '').trimEnd();
    fm += `\ncoverCredit:\n  author: ${yaml(photo.author)}\n  license: ${yaml(photo.license)}\n  sourceUrl: ${yaml(photo.sourceUrl)}`;

    fs.writeFileSync(file, `---\n${fm}\n---\n${body}`, 'utf8');
    done++;
    console.log(`✓ ${slug}\n    ${photo.license} · ${photo.author} · ${Math.round(bytes / 1024)} КБ`);

    // Вежливая пауза, чтобы не долбить API Wikimedia.
    await new Promise((r) => setTimeout(r, 400));
  } catch (err) {
    failed.push(`${slug} — ${err.message}`);
  }
}

console.log(`\nГотово: загружено ${done}, пропущено ${skipped}, не удалось ${failed.length}`);
if (failed.length) {
  console.log('\nНе получилось:');
  failed.forEach((f) => console.log('  ' + f));
}

/* ═══════════════════════════════════════════════════════════════════════
   ГАЛЕРЕИ ВНУТРИ СТАТЕЙ и ЛЕНТЫ КАТЕГОРИЙ
   ═══════════════════════════════════════════════════════════════════════
   Оба режима запускаются флагом --sets, отдельно от обложек: наборов
   немного, а обложки трогать при этом не нужно.

       node scripts/fetch-photos.mjs --sets
*/

/** Несколько фото внутрь одной статьи. Пишутся в поле gallery во frontmatter. */
const GALLERY_QUERIES = {
  // Перечень из Постановления Правительства РФ № 974. Породы редкие, и на
  // Commons есть далеко не все — чего не нашлось, скрипт честно перечислит.
  'potencialno-opasnye-porody-sobak': [
    { key: 'akbash', caption: 'Акбаш', query: 'Akbash dog' },
    { key: 'amerikanskiy-bandog', caption: 'Американский бандог', query: 'American Bandogge' },
    { key: 'ambuldog', caption: 'Амбульдог', query: 'American Bulldog' },
    { key: 'brazilskiy-buldog', caption: 'Бразильский бульдог', query: 'Buldogue Campeiro' },
    { key: 'bulli-kutta', caption: 'Булли кутта', query: 'Bully Kutta' },
    { key: 'alapahskiy-buldog', caption: 'Бульдог алапахский чистокровный (отто)', query: 'Alapaha Blue Blood Bulldog' },
    { key: 'bendog', caption: 'Бэндог', query: 'Bandogge dog breed' },
    { key: 'volkosob', caption: 'Волкособ (гибрид волка)', query: 'Wolfdog', allowWild: true },
    // «Gull Dong» по-английски совпадает с gull (чайка) — Commons отдавал
    // фото чайки. Ищем по второму названию породы.
    { key: 'gul-dog', caption: 'Гуль дог', query: 'Gull Terrier Pakistani dog' },
    { key: 'pitbulmastif', caption: 'Питбульмастиф', query: 'Bullmastiff dog standing' },
    { key: 'severokavkazskaya', caption: 'Северокавказская собака', query: 'Caucasian Shepherd Dog' },
  ],

  // Породы для квартиры. Порядок совпадает с порядком разборов в статье.
  // ⚠️ Поле `article` — slug статьи-портрета про породу. Фото становится
  // ссылкой на неё, но только если такая статья реально существует: написали
  // портрет — допишите сюда строку и прогоните `--sets` по этой статье.
  'sobaka-dlya-kvartiry-kakie-porody-podhodyat': [
    {
      key: 'francuzskiy-buldog',
      caption: 'Французский бульдог',
      query: 'French Bulldog',
      article: 'francuzskiy-buldog-harakter-uhod-zdorovye',
    },
    {
      key: 'mops',
      caption: 'Мопс',
      query: 'Pug dog',
      article: 'mops-harakter-uhod-i-osobennosti-porody',
    },
    {
      key: 'kavaler-king-charlz',
      caption: 'Кавалер-кинг-чарльз-спаниель',
      query: 'Cavalier King Charles Spaniel',
      article: 'kavaler-king-charlz-spaniel-harakter-i-uhod',
    },
    {
      key: 'shi-tcu',
      caption: 'Ши-тцу',
      query: 'Shih Tzu',
      article: 'shi-tcu-harakter-uhod-i-osobennosti-porody',
    },
    {
      key: 'taksa',
      caption: 'Такса',
      query: 'Dachshund dog',
      article: 'taksa-harakter-uhod-i-osobennosti-porody',
    },
  ],

  // Породы кошек для семьи с ребёнком.
  'porody-koshek-dlya-semi-s-rebenkom': [
    {
      key: 'meyn-kun',
      caption: 'Мейн-кун',
      query: 'Maine Coon cat',
      article: 'meyn-kun-harakter-uhod-i-osobennosti-porody',
    },
    {
      key: 'regdoll',
      caption: 'Рэгдолл',
      query: 'Ragdoll cat',
      article: 'regdoll-harakter-uhod-i-osobennosti-porody',
    },
    {
      key: 'britanskaya',
      caption: 'Британская короткошёрстная',
      query: 'British Shorthair cat',
      article: 'britanskaya-koshka-harakter-uhod-osobennosti',
    },
    {
      key: 'sibirskaya',
      caption: 'Сибирская кошка',
      query: 'Siberian cat breed',
      article: 'sibirskaya-koshka-harakter-uhod-osobennosti',
    },
    { key: 'birmanskaya', caption: 'Бирманская кошка', query: 'Birman cat' },
  ],
};

/** Лента фото на странице категории. Пишется в src/data/category-photos.json. */
const CATEGORY_PHOTOS = {
  popugai: [
    {
      key: 'volnistyy',
      caption: 'Волнистый попугай',
      query: 'Budgerigar bird',
      article: 'volnistyy-popugay-kto-eto-i-chto-emu-nuzhno',
    },
    {
      key: 'korella',
      caption: 'Корелла',
      query: 'Cockatiel parrot',
      article: 'korella-kto-eto-i-chto-ey-nuzhno',
    },
    {
      key: 'nerazluchnik',
      caption: 'Неразлучники',
      query: 'Lovebird Agapornis',
      article: 'nerazluchniki-kto-eto-i-chto-im-nuzhno',
    },
    {
      key: 'zhako',
      caption: 'Жако',
      query: 'Grey parrot Psittacus',
      article: 'zhako-kto-eto-i-chto-emu-nuzhno',
    },
    {
      key: 'ozherelovyy',
      caption: 'Ожереловый попугай',
      query: 'Psittacula krameri pet',
      article: 'ozherelovyy-popugay-kto-eto-i-chto-emu-nuzhno',
    },
  ],
  gryzuny: [
    {
      key: 'krolik',
      caption: 'Кролик',
      query: 'Domestic rabbit',
      article: 'dekorativnyy-krolik-kto-eto-i-chto-emu-nuzhno',
    },
    {
      key: 'krysa',
      caption: 'Декоративная крыса',
      query: 'Fancy rat pet',
      article: 'dekorativnaya-krysa-kto-eto-i-chto-ey-nuzhno',
    },
    {
      key: 'shinshilla',
      caption: 'Шиншилла',
      query: 'Chinchilla pet',
      article: 'shinshilla-kto-eto-i-chto-ey-nuzhno',
    },
    {
      key: 'homyak',
      caption: 'Хомяк',
      query: 'Syrian hamster',
      article: 'siriyskiy-homyak-kto-eto-i-chto-emu-nuzhno',
    },
    {
      key: 'morskaya-svinka',
      caption: 'Морская свинка',
      query: 'Guinea pig',
      article: 'morskaya-svinka-kto-eto-i-chto-ey-nuzhno',
    },
  ],
};

/**
 * Справочник пород: фото для страниц /porody/koshki и /porody/sobaki.
 * Список пород и их порядок живут в `src/data/breeds-*.mjs`, здесь только
 * поисковые запросы. Ключ должен совпадать с `key` в файле пород — по нему
 * страница находит снимок.
 */
const BREED_PHOTOS = {
  koshki: [
    { key: 'meyn-kun', caption: 'Мейн-кун', query: 'Maine Coon cat' },
    { key: 'britanskaya', caption: 'Британская короткошёрстная', query: 'British Shorthair cat' },
    { key: 'shotlandskaya-vislouhaya', caption: 'Шотландская вислоухая', query: 'Scottish Fold cat' },
    { key: 'sfinks', caption: 'Сфинкс', query: 'Sphynx cat' },
    {
      key: 'bengalskaya',
      caption: 'Бенгальская',
      query: 'Bengal cat breed',
      article: 'bengalskaya-koshka-harakter-uhod-osobennosti',
    },
    {
      key: 'siamskaya',
      caption: 'Сиамская',
      query: 'Siamese cat',
      article: 'siamskaya-koshka-harakter-uhod-osobennosti',
    },
    {
      key: 'regdoll',
      caption: 'Рэгдолл',
      query: 'Ragdoll cat',
      article: 'regdoll-harakter-uhod-i-osobennosti-porody',
    },
    { key: 'sibirskaya', caption: 'Сибирская', query: 'Siberian cat breed' },
    {
      key: 'birmanskaya',
      caption: 'Бирманская',
      query: 'Birman cat',
      article: 'birmanskaya-koshka-harakter-uhod-osobennosti',
    },
    {
      key: 'persidskaya',
      caption: 'Персидская',
      query: 'Afkhami Persian cat',
      article: 'persidskaya-koshka-harakter-uhod-osobennosti',
    },
    {
      key: 'abissinskaya',
      caption: 'Абиссинская',
      query: 'Poktori Abyssinian cat',
      article: 'abissinskaya-koshka-harakter-uhod-osobennosti',
    },
    {
      key: 'russkaya-golubaya',
      caption: 'Русская голубая',
      query: 'Russian Blue cat',
      article: 'russkaya-golubaya-koshka-harakter-uhod-osobennosti',
    },
  ],
  sobaki: [
    { key: 'francuzskiy-buldog', caption: 'Французский бульдог', query: 'French Bulldog' },
    { key: 'taksa', caption: 'Такса', query: 'Dachshund dog' },
    {
      key: 'mops',
      caption: 'Мопс',
      query: 'Pug dog',
      article: 'mops-harakter-uhod-i-osobennosti-porody',
    },
    {
      key: 'kavaler-king-charlz',
      caption: 'Кавалер-кинг-чарльз-спаниель',
      query: 'Cavalier King Charles Spaniel',
      article: 'kavaler-king-charlz-spaniel-harakter-i-uhod',
    },
    {
      key: 'shi-tcu',
      caption: 'Ши-тцу',
      query: 'Shih Tzu',
      article: 'shi-tcu-harakter-uhod-i-osobennosti-porody',
    },
    {
      key: 'labrador',
      caption: 'Лабрадор-ретривер',
      query: 'Labrador Retriever Aurora Colorado',
      article: 'labrador-retriver-harakter-uhod-osobennosti',
    },
    {
      key: 'nemeckaya-ovcharka',
      caption: 'Немецкая овчарка',
      query: 'German Shepherd dog',
      article: 'nemeckaya-ovcharka-harakter-uhod-osobennosti',
    },
    {
      key: 'yorkshirskiy-terer',
      caption: 'Йоркширский терьер',
      query: 'Yorkshire Terrier',
      article: 'yorkshirskiy-terer-harakter-uhod-osobennosti',
    },
    {
      key: 'chihuahua',
      caption: 'Чихуахуа',
      query: 'Chihuahua sitting sirraychen',
      article: 'chihuahua-harakter-uhod-osobennosti',
    },
    {
      key: 'pomeranskiy-shpic',
      caption: 'Померанский шпиц',
      query: 'Pomeranian dog',
      article: 'pomeranskiy-shpic-harakter-uhod-osobennosti',
    },
    // «Husky» в Commons — это ещё и порода лаек и куча ездовых упряжек.
    {
      key: 'haski',
      caption: 'Сибирский хаски',
      query: 'Juvenile Siberian Husky',
      article: 'sibirskiy-haski-harakter-uhod-osobennosti',
    },
    {
      key: 'dzhek-rassel',
      caption: 'Джек-рассел-терьер',
      query: 'Jack Russell Terrier',
      article: 'dzhek-rassel-terer-harakter-uhod-osobennosti',
    },
  ],
  // ⚠️ Справочник попугаев в BREED_PHOTOS пока содержит только два новых вида
  // (lori, kaik) — остальные 12 карточек в /porody/popugai были опубликованы
  // без фото ещё до появления этого ключа (обнаружено 06.08.2026). Дописывать
  // остальные — отдельная задача, не входящая в текущий подбор.
  popugai: [
    {
      key: 'lori',
      caption: 'Лори (радужный лорикет)',
      query: 'Rainbow lorikeet bird',
      article: 'lori-kto-eto-i-chto-emu-nuzhno',
    },
    {
      key: 'kaik',
      caption: 'Каик',
      query: 'Black-headed caique',
      article: 'kaik-kto-eto-i-chto-emu-nuzhno',
    },
  ],
};

if (SETS || BREEDS) {
  const GALLERY_DIR = path.join(ROOT, 'public/images/photos/gallery');
  const DATA_DIR = path.join(ROOT, 'src/data');
  fs.mkdirSync(GALLERY_DIR, { recursive: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });

  /** Скачивает набор фото. Возвращает только то, что реально нашлось. */
  async function fetchSet(items, prefix, dir, publicBase) {
    const out = [];
    const miss = [];
    for (const item of items) {
      try {
        const photo = await findPhoto(item.query, { allowWild: item.allowWild });
        if (!photo) {
          miss.push(item.caption);
          continue;
        }
        const ext = photo.url.toLowerCase().includes('.png') ? 'png' : 'jpg';
        const filename = `${prefix}-${item.key}.${ext}`;
        await download(photo.url, path.join(dir, filename));
        out.push({
          src: `${publicBase}/${filename}`,
          alt: item.caption,
          caption: item.caption,
          author: photo.author,
          license: photo.license,
          sourceUrl: photo.sourceUrl,
          // Есть статья-портрет про эту породу — фото станет ссылкой на неё.
          ...(item.article ? { article: item.article } : {}),
        });
        console.log(`  ✓ ${item.caption} — ${photo.license} · ${photo.author}`);
        await new Promise((r) => setTimeout(r, 400));
      } catch (err) {
        miss.push(`${item.caption} (${err.message})`);
      }
    }
    return { out, miss };
  }

  const allMissing = [];

  if (BREEDS) console.log('\n\n=== Галереи и ленты пропущены (режим --breeds) ===');

  if (!BREEDS) console.log('\n\n=== Галереи внутри статей ===');
  for (const [slug, items] of Object.entries(BREEDS ? {} : GALLERY_QUERIES)) {
    // Перечислили слаги в командной строке — трогаем только их. Иначе новая
    // галерея тянула бы за собой перекачку уже проверенных глазами наборов.
    if (ONLY.length > 0 && !ONLY.includes(slug)) continue;
    console.log(`\n${slug}:`);
    const file = path.join(ARTICLES_DIR, `${slug}.md`);
    if (!fs.existsSync(file)) {
      console.log('  ✗ нет такой статьи');
      continue;
    }
    const raw = fs.readFileSync(file, 'utf8');
    const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!m) {
      console.log('  ✗ битый frontmatter');
      continue;
    }
    let [, fm, body] = m;

    const { out, miss } = await fetchSet(items, slug, GALLERY_DIR, '/images/photos/gallery');
    if (miss.length) allMissing.push(`${slug}: ${miss.join(', ')}`);

    // Старую галерею вырезаем целиком: ключ + все строки с отступом под ним.
    fm = fm.replace(/^gallery:[ \t]*\r?\n(?:[ \t]+\S.*\r?\n?)*/m, '').trimEnd();
    if (out.length) {
      const yamlList = out
        .map(
          (p) =>
            `  - src: ${yaml(p.src)}\n    alt: ${yaml(p.alt)}\n    caption: ${yaml(p.caption)}\n` +
            `    author: ${yaml(p.author)}\n    license: ${yaml(p.license)}\n    sourceUrl: ${yaml(p.sourceUrl)}` +
            (p.article ? `\n    article: ${yaml(p.article)}` : ''),
        )
        .join('\n');
      fm += `\ngallery:\n${yamlList}`;
    }
    fs.writeFileSync(file, `---\n${fm}\n---\n${body}`, 'utf8');
    console.log(`  → в галерее ${out.length} из ${items.length}`);
  }

  // Ленты категорий. Перечисленный аргумент может быть слагом категории
  // (`--sets popugai`) — тогда трогаем только её. Это важно: раньше любой
  // прогон лент перекачивал их все разом и стирал уже проверенные глазами
  // фото (28.07.2026 пришлось откатывать через git четыре снимка грызунов).
  const CATEGORY_KEYS = Object.keys(CATEGORY_PHOTOS);
  const wantedCats = ONLY.filter((a) => CATEGORY_KEYS.includes(a));
  const skipCats = BREEDS || (ONLY.length > 0 && wantedCats.length === 0);

  if (skipCats) {
    if (!BREEDS) console.log('\n\n=== Ленты категорий пропущены (указаны конкретные статьи) ===');
  } else {
    console.log('\n\n=== Ленты категорий ===');
    const CATEGORY_DIR = path.join(ROOT, 'public/images/photos/category');
    fs.mkdirSync(CATEGORY_DIR, { recursive: true });
    const catData = {};
    for (const [cat, items] of Object.entries(CATEGORY_PHOTOS)) {
      if (wantedCats.length > 0 && !wantedCats.includes(cat)) continue;
      console.log(`\n${cat}:`);
      const { out, miss } = await fetchSet(items, cat, CATEGORY_DIR, '/images/photos/category');
      if (miss.length) allMissing.push(`категория ${cat}: ${miss.join(', ')}`);
      catData[cat] = out;
      console.log(`  → в ленте ${out.length} из ${items.length}`);
    }
    // Дописываем, а не перезаписываем: прогон по одной категории не должен
    // стирать ленту другой.
    const catFile = path.join(DATA_DIR, 'category-photos.json');
    const existingCats = fs.existsSync(catFile)
      ? JSON.parse(fs.readFileSync(catFile, 'utf8'))
      : {};
    fs.writeFileSync(
      catFile,
      JSON.stringify({ ...existingCats, ...catData }, null, 2) + '\n',
      'utf8',
    );
  }

  // Справочник пород: /porody/koshki и /porody/sobaki.
  if (BREEDS) {
    console.log('\n\n=== Справочник пород ===');
    const BREED_DIR = path.join(ROOT, 'public/images/photos/breeds');
    fs.mkdirSync(BREED_DIR, { recursive: true });
    const breedData = {};
    for (const [species, items] of Object.entries(BREED_PHOTOS)) {
      // Можно ограничить одним видом: `--breeds koshki`.
      if (ONLY.length > 0 && !ONLY.includes(species)) continue;
      console.log(`\n${species}:`);
      const { out, miss } = await fetchSet(items, species, BREED_DIR, '/images/photos/breeds');
      if (miss.length) allMissing.push(`породы ${species}: ${miss.join(', ')}`);
      breedData[species] = out;
      console.log(`  → в справочнике ${out.length} из ${items.length}`);
    }

    // Дописываем, а не перезаписываем: прогон по одному виду не должен
    // стирать фотографии другого.
    const breedFile = path.join(DATA_DIR, 'breed-photos.json');
    const existing = fs.existsSync(breedFile)
      ? JSON.parse(fs.readFileSync(breedFile, 'utf8'))
      : {};
    fs.writeFileSync(
      breedFile,
      JSON.stringify({ ...existing, ...breedData }, null, 2) + '\n',
      'utf8',
    );
  }

  if (allMissing.length) {
    console.log('\n\nНе нашлось фото:');
    allMissing.forEach((x) => console.log('  ' + x));
  }
}
