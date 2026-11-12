<?php
declare(strict_types=1);

use App\Core\DB;

/*
 * Base data (always) + demo catalog (optional).
 * All producers and products below are FICTIONAL placeholders — in production
 * the catalog comes from vinX via the sync (bin/console vinx:sync).
 */

function j(array $a): string
{
    return (string) json_encode($a, JSON_UNESCAPED_UNICODE);
}

function seed_base(DB $db): void
{
    $groups = [
        ['retail', 'Privatkunden', 0, 'gross', 0, 0, 'PRIV'],
        ['b2b', 'Fachhandel', 1, 'net', 15, 30000, 'HAND'],
        ['gastro', 'Gastronomie', 1, 'net', 20, 25000, 'GASTRO'],
    ];
    foreach ($groups as [$code, $name, $b2b, $display, $disc, $min, $erp]) {
        $db->insert('customer_groups', [
            'code' => $code, 'name' => $name, 'is_b2b' => $b2b, 'price_display' => $display,
            'discount_percent' => $disc, 'min_order_net' => $min, 'erp_code' => $erp,
        ]);
    }

    $cats = [
        ['rotwein', 'wine', ['de' => 'Rotwein', 'fr' => 'Vin rouge', 'it' => 'Vino rosso', 'en' => 'Red wine'], 1],
        ['weisswein', 'wine', ['de' => 'Weisswein', 'fr' => 'Vin blanc', 'it' => 'Vino bianco', 'en' => 'White wine'], 2],
        ['rose', 'wine', ['de' => 'Rosé', 'fr' => 'Rosé', 'it' => 'Rosato', 'en' => 'Rosé'], 3],
        ['schaumwein', 'wine', ['de' => 'Schaumwein', 'fr' => 'Vin mousseux', 'it' => 'Spumante', 'en' => 'Sparkling'], 4],
        ['suesswein', 'wine', ['de' => 'Dessertwein', 'fr' => 'Vin doux', 'it' => 'Vino dolce', 'en' => 'Dessert wine'], 5],
        ['olivenoel', 'speciality', ['de' => 'Olivenöl', 'fr' => 'Huile d\'olive', 'it' => 'Olio d\'oliva', 'en' => 'Olive oil'], 10],
        ['aceto', 'speciality', ['de' => 'Aceto & Balsamico', 'fr' => 'Vinaigre & Balsamique', 'it' => 'Aceto & Balsamico', 'en' => 'Vinegar & Balsamic'], 11],
        ['pasta-reis', 'speciality', ['de' => 'Pasta & Risotto', 'fr' => 'Pâtes & Risotto', 'it' => 'Pasta & Risotto', 'en' => 'Pasta & Risotto'], 12],
        ['feinkost', 'speciality', ['de' => 'Feinkost', 'fr' => 'Épicerie fine', 'it' => 'Gastronomia', 'en' => 'Fine food'], 13],
        ['spirituosen', 'spirit', ['de' => 'Grappa & Spirituosen', 'fr' => 'Grappa & Spiritueux', 'it' => 'Grappa & Distillati', 'en' => 'Grappa & Spirits'], 20],
    ];
    foreach ($cats as [$slug, $type, $name, $sort]) {
        $db->insert('categories', ['slug' => $slug, 'type' => $type, 'name_json' => j($name), 'sort' => $sort]);
    }

    $db->insert('coupons', ['code' => 'WILLKOMMEN10', 'type' => 'percent', 'value' => 10, 'min_total' => 10000, 'b2c_only' => 1, 'active' => 1]);
}

function seed_demo(DB $db): void
{
    $now = DB::now();
    $cat = fn (string $slug) => (int) $db->value('SELECT id FROM categories WHERE slug = ?', [$slug]);

    $producers = [
        ['tenuta-collealto', 'Tenuta Collealto', 'Italia', 'Toscana', '1898', '42 ha',
            ['de' => 'Familienweingut auf den Hügeln zwischen Florenz und Siena. Sangiovese in vierter Generation, spontan vergoren, im grossen Holzfass ausgebaut.',
             'en' => 'Family estate in the hills between Florence and Siena. Fourth-generation Sangiovese, wild-fermented and aged in large casks.',
             'it' => 'Tenuta di famiglia sulle colline tra Firenze e Siena. Sangiovese da quattro generazioni, fermentazione spontanea e botte grande.',
             'fr' => 'Domaine familial sur les collines entre Florence et Sienne. Sangiovese depuis quatre générations, fermentation spontanée, grands fûts.']],
        ['cantina-valrosa', 'Cantina Valrosa', 'Italia', 'Piemonte', '1956', '18 ha',
            ['de' => 'Kleine Kellerei in den Langhe. Nebbiolo und Barbera von steilen Kalkmergel-Lagen, präzise und langlebig.',
             'en' => 'Small winery in the Langhe. Nebbiolo and Barbera from steep calcareous marl slopes — precise and long-lived.']],
        ['podere-san-lucio', 'Podere San Lucio', 'Italia', 'Veneto', '1972', '25 ha',
            ['de' => 'Am Fuss der Valpolicella-Hügel. Getrocknete Trauben, Geduld und Handarbeit für Amarone und Ripasso.',
             'en' => 'At the foot of the Valpolicella hills. Dried grapes, patience and handwork for Amarone and Ripasso.']],
        ['masseria-terrarossa', 'Masseria Terrarossa', 'Italia', 'Puglia', '2004', '60 ha',
            ['de' => 'Biologisch zertifizierte Masseria im Salento. Primitivo, Negroamaro und uralte Olivenhaine.',
             'en' => 'Certified organic masseria in Salento. Primitivo, Negroamaro and ancient olive groves.']],
        ['cantine-dell-etna', 'Vigneti Alta Quota', 'Italia', 'Sicilia', '2009', '11 ha',
            ['de' => 'Vulkanweine von den Nordhängen des Ätna, Rebstöcke bis 900 m ü. M.',
             'en' => 'Volcanic wines from the northern slopes of Etna, vines up to 900 m altitude.']],
        ['frantoio-del-lago', 'Frantoio del Lago', 'Italia', 'Lombardia', '1931', '—',
            ['de' => 'Ölmühle und Feinkostmanufaktur am Gardasee: Olivenöl, Aceto und Sottoli.',
             'en' => 'Olive mill and fine-food workshop on Lake Garda: olive oil, vinegar and preserves.']],
    ];
    $pid = [];
    foreach ($producers as [$slug, $name, $country, $region, $founded, $ha, $desc]) {
        $pid[$slug] = $db->insert('producers', [
            'slug' => $slug, 'name' => $name, 'country' => $country, 'region' => $region,
            'founded' => $founded, 'hectares' => $ha, 'description_json' => j($desc),
        ]);
    }

    // sku, slug, type, cat, producer, name, short(de/en), color, region, appellation, grapes, vintage, ml, alc, organic, price CHF, stock, featured, tasting(de/en), pairing(de/en), temp, aging, rating
    $products = [
        ['W-1001', 'chianti-classico-riserva', 'wine', 'rotwein', 'tenuta-collealto', 'Chianti Classico Riserva DOCG',
            ['de' => 'Kirsche, Veilchen, feine Würze — klassisch und elegant.', 'en' => 'Cherry, violet, fine spice — classic and elegant.'],
            'red', 'Toscana', 'Chianti Classico DOCG', 'Sangiovese 95%, Canaiolo 5%', '2020', 750, 14.0, 0, 34.50, 240, 1,
            ['de' => 'Leuchtendes Rubin. Sauerkirsche, getrocknete Rosen, Tabak. Straffe Tannine, lebendige Säure, langer, salziger Abgang.',
             'en' => 'Bright ruby. Sour cherry, dried roses, tobacco. Firm tannins, lively acidity, long savoury finish.'],
            ['de' => 'Bistecca, Pappardelle al ragù, gereifter Pecorino', 'en' => 'Bistecca, pappardelle al ragù, aged pecorino'],
            '16–18 °C', '2024–2034', '93 Punkte'],
        ['W-1002', 'toscana-rosso-collealto', 'wine', 'rotwein', 'tenuta-collealto', 'Rosso di Collealto IGT',
            ['de' => 'Saftiger Alltagswein mit Charakter.', 'en' => 'Juicy everyday wine with character.'],
            'red', 'Toscana', 'Toscana IGT', 'Sangiovese, Merlot', '2022', 750, 13.5, 0, 16.90, 600, 0,
            ['de' => 'Rote Beeren, Pflaume, ein Hauch Kräuter. Weich und unkompliziert.', 'en' => 'Red berries, plum, a touch of herbs. Soft and easy-going.'],
            ['de' => 'Pizza, Pasta, Grilladen', 'en' => 'Pizza, pasta, grilled meats'], '15–17 °C', '2024–2027', null],
        ['W-1003', 'barolo-cannubi', 'wine', 'rotwein', 'cantina-valrosa', 'Barolo DOCG Vigna Serra',
            ['de' => 'Der König der Weine — Rosen, Teer, Kraft.', 'en' => 'The king of wines — roses, tar, power.'],
            'red', 'Piemonte', 'Barolo DOCG', 'Nebbiolo 100%', '2019', 750, 14.5, 0, 69.00, 72, 1,
            ['de' => 'Granatrot mit orangem Rand. Rosen, Teer, Lakritz, Trüffel. Mächtige, feinkörnige Tannine, enorme Länge.',
             'en' => 'Garnet with orange rim. Roses, tar, liquorice, truffle. Powerful, fine-grained tannins, enormous length.'],
            ['de' => 'Brasato al Barolo, Trüffelrisotto, Wild', 'en' => 'Brasato al Barolo, truffle risotto, game'],
            '17–18 °C', '2025–2045', '96 Punkte'],
        ['W-1004', 'barbera-d-alba', 'wine', 'rotwein', 'cantina-valrosa', 'Barbera d\'Alba DOC Superiore',
            ['de' => 'Frische Säure, dunkle Kirsche, Schmelz.', 'en' => 'Fresh acidity, dark cherry, depth.'],
            'red', 'Piemonte', 'Barbera d\'Alba DOC', 'Barbera 100%', '2021', 750, 14.0, 0, 24.80, 300, 0,
            ['de' => 'Dunkle Kirsche, Brombeere, Kakao. Saftig mit pikanter Säure.', 'en' => 'Dark cherry, blackberry, cocoa. Juicy with piquant acidity.'],
            ['de' => 'Vitello tonnato, Salumi, Agnolotti', 'en' => 'Vitello tonnato, salumi, agnolotti'], '16 °C', '2024–2030', null],
        ['W-1005', 'amarone-della-valpolicella', 'wine', 'rotwein', 'podere-san-lucio', 'Amarone della Valpolicella DOCG',
            ['de' => 'Aus getrockneten Trauben — opulent und samtig.', 'en' => 'From dried grapes — opulent and velvety.'],
            'red', 'Veneto', 'Amarone della Valpolicella DOCG', 'Corvina, Corvinone, Rondinella', '2018', 750, 16.0, 0, 58.00, 96, 1,
            ['de' => 'Tiefes Purpur. Dörrpflaume, Kirschlikör, Zimt, Schokolade. Vollmundig, samtig, warmer Abgang.',
             'en' => 'Deep purple. Prune, cherry liqueur, cinnamon, chocolate. Full-bodied, velvety, warm finish.'],
            ['de' => 'Geschmortes Rind, Parmigiano 36 Monate, Bitterschokolade', 'en' => 'Braised beef, 36-month Parmigiano, dark chocolate'],
            '18 °C', '2024–2040', '94 Punkte'],
        ['W-1006', 'ripasso-superiore', 'wine', 'rotwein', 'podere-san-lucio', 'Valpolicella Ripasso Superiore DOC',
            ['de' => 'Der «kleine Amarone».', 'en' => 'The "baby Amarone".'],
            'red', 'Veneto', 'Valpolicella Ripasso DOC', 'Corvina, Rondinella', '2021', 750, 14.0, 0, 27.50, 360, 0,
            ['de' => 'Kirsche, Feige, Gewürze. Rund und einladend.', 'en' => 'Cherry, fig, spice. Round and inviting.'],
            ['de' => 'Risotto all\'Amarone, Lasagne', 'en' => 'Risotto all\'Amarone, lasagne'], '17 °C', '2024–2030', null],
        ['W-1007', 'primitivo-di-manduria', 'wine', 'rotwein', 'masseria-terrarossa', 'Primitivo di Manduria DOP Bio',
            ['de' => 'Sonnengereift, dunkelfruchtig, biologisch.', 'en' => 'Sun-ripened, dark-fruited, organic.'],
            'red', 'Puglia', 'Primitivo di Manduria DOP', 'Primitivo 100%', '2022', 750, 14.5, 1, 22.50, 480, 1,
            ['de' => 'Brombeerkonfitüre, Dörrfeige, Vanille. Weiche Tannine.', 'en' => 'Blackberry jam, dried fig, vanilla. Soft tannins.'],
            ['de' => 'Grilliertes Lamm, Orecchiette mit Ragù', 'en' => 'Grilled lamb, orecchiette with ragù'], '16–18 °C', '2024–2029', null],
        ['W-1008', 'etna-rosso', 'wine', 'rotwein', 'cantine-dell-etna', 'Etna Rosso DOC Contrada',
            ['de' => 'Vulkanisch, rauchig, burgundisch fein.', 'en' => 'Volcanic, smoky, Burgundian finesse.'],
            'red', 'Sicilia', 'Etna DOC', 'Nerello Mascalese, Nerello Cappuccio', '2021', 750, 13.5, 1, 32.00, 150, 0,
            ['de' => 'Walderdbeere, Granatapfel, Feuerstein, Asche. Feine Säure, mineralisch.', 'en' => 'Wild strawberry, pomegranate, flint, ash. Fine acidity, mineral.'],
            ['de' => 'Thunfisch, Pilzgerichte, Kalb', 'en' => 'Tuna, mushroom dishes, veal'], '15–16 °C', '2024–2032', '92 Punkte'],
        ['W-2001', 'vermentino-toscana', 'wine', 'weisswein', 'tenuta-collealto', 'Vermentino Toscana IGT',
            ['de' => 'Meeresbrise im Glas.', 'en' => 'Sea breeze in a glass.'],
            'white', 'Toscana', 'Toscana IGT', 'Vermentino 100%', '2023', 750, 12.5, 0, 19.50, 420, 0,
            ['de' => 'Zitrus, weisser Pfirsich, mediterrane Kräuter, salzig.', 'en' => 'Citrus, white peach, Mediterranean herbs, saline.'],
            ['de' => 'Meeresfrüchte, Fritto misto', 'en' => 'Seafood, fritto misto'], '9–11 °C', '2024–2026', null],
        ['W-2002', 'etna-bianco', 'wine', 'weisswein', 'cantine-dell-etna', 'Etna Bianco DOC',
            ['de' => 'Carricante vom Vulkan — straff und salzig.', 'en' => 'Carricante from the volcano — taut and saline.'],
            'white', 'Sicilia', 'Etna DOC', 'Carricante 90%, Catarratto 10%', '2023', 750, 12.5, 1, 29.00, 180, 1,
            ['de' => 'Zitronenzeste, grüner Apfel, Kamille, Feuerstein.', 'en' => 'Lemon zest, green apple, chamomile, flint.'],
            ['de' => 'Crudo, Spaghetti alle vongole', 'en' => 'Crudo, spaghetti alle vongole'], '10–12 °C', '2024–2030', null],
        ['W-2003', 'roero-arneis', 'wine', 'weisswein', 'cantina-valrosa', 'Roero Arneis DOCG',
            ['de' => 'Birne, Mandelblüte, feine Frische.', 'en' => 'Pear, almond blossom, fine freshness.'],
            'white', 'Piemonte', 'Roero DOCG', 'Arneis 100%', '2023', 750, 13.0, 0, 21.00, 260, 0,
            ['de' => 'Birne, Aprikose, Mandelblüte; cremig und frisch.', 'en' => 'Pear, apricot, almond blossom; creamy and fresh.'],
            ['de' => 'Vitello tonnato, Spargel', 'en' => 'Vitello tonnato, asparagus'], '10 °C', '2024–2027', null],
        ['W-3001', 'rosato-salento', 'wine', 'rose', 'masseria-terrarossa', 'Negroamaro Rosato Salento IGP Bio',
            ['de' => 'Sommer auf der Terrasse.', 'en' => 'Summer on the terrace.'],
            'rose', 'Puglia', 'Salento IGP', 'Negroamaro 100%', '2023', 750, 12.5, 1, 17.50, 320, 0,
            ['de' => 'Erdbeere, Granatapfel, Blutorange. Knackig trocken.', 'en' => 'Strawberry, pomegranate, blood orange. Crisp and dry.'],
            ['de' => 'Aperitivo, Bruschetta, Pizza', 'en' => 'Aperitivo, bruschetta, pizza'], '8–10 °C', '2024–2025', null],
        ['W-4001', 'prosecco-superiore', 'wine', 'schaumwein', 'podere-san-lucio', 'Valdobbiadene Prosecco Superiore DOCG Extra Dry',
            ['de' => 'Feinperlig, blumig, unwiderstehlich.', 'en' => 'Fine bubbles, floral, irresistible.'],
            'sparkling', 'Veneto', 'Conegliano Valdobbiadene DOCG', 'Glera 100%', 'NV', 750, 11.0, 0, 21.90, 720, 1,
            ['de' => 'Grüner Apfel, Akazienblüte, Birne. Cremige Perlage.', 'en' => 'Green apple, acacia blossom, pear. Creamy mousse.'],
            ['de' => 'Aperitivo, Rohschinken, Sushi', 'en' => 'Aperitivo, cured ham, sushi'], '6–8 °C', '2024–2026', null],
        ['W-5001', 'passito-di-pantelleria', 'wine', 'suesswein', 'cantine-dell-etna', 'Passito di Pantelleria DOC',
            ['de' => 'Aprikose, Honig, Orangenblüte — 50 cl.', 'en' => 'Apricot, honey, orange blossom — 50 cl.'],
            'sweet', 'Sicilia', 'Pantelleria DOC', 'Zibibbo 100%', '2020', 500, 14.5, 0, 39.00, 60, 0,
            ['de' => 'Dörraprikose, Honig, Datteln, Orangenblüte. Süss, frisch und lang.', 'en' => 'Dried apricot, honey, dates, orange blossom. Sweet, fresh and long.'],
            ['de' => 'Cannoli, Blauschimmelkäse', 'en' => 'Cannoli, blue cheese'], '10–12 °C', '2024–2040', null],
        ['S-1001', 'olio-extravergine-garda', 'speciality', 'olivenoel', 'frantoio-del-lago', 'Olio Extravergine Garda DOP',
            ['de' => 'Mild-fruchtig, kaltextrahiert, 50 cl.', 'en' => 'Mild and fruity, cold-extracted, 50 cl.'],
            null, 'Lombardia', 'Garda DOP', 'Casaliva, Leccino', '2024', 500, null, 0, 24.00, 200, 1,
            ['de' => 'Mandel, Artischocke, frisches Gras. Sanft pfeffrig im Abgang.', 'en' => 'Almond, artichoke, fresh grass. Gently peppery finish.'],
            ['de' => 'Fisch, Carpaccio, Salate', 'en' => 'Fish, carpaccio, salads'], null, null, null],
        ['S-1002', 'olio-salento-bio', 'speciality', 'olivenoel', 'masseria-terrarossa', 'Olio Extravergine Salento Bio',
            ['de' => 'Intensiv, grün, aus alten Bäumen. 75 cl.', 'en' => 'Intense, green, from ancient trees. 75 cl.'],
            null, 'Puglia', null, 'Coratina, Ogliarola', '2024', 750, null, 1, 29.50, 160, 0,
            ['de' => 'Grüne Tomate, Rucola, bitter-scharf.', 'en' => 'Green tomato, rocket, bitter and spicy.'],
            ['de' => 'Bruschetta, Hülsenfrüchte, Grillgemüse', 'en' => 'Bruschetta, legumes, grilled vegetables'], null, null, null],
        ['S-2001', 'aceto-balsamico-12', 'speciality', 'aceto', 'frantoio-del-lago', 'Aceto Balsamico 12 anni',
            ['de' => '12 Jahre im Fass gereift, 100 ml.', 'en' => 'Aged 12 years in casks, 100 ml.'],
            null, 'Emilia-Romagna', null, null, null, 100, null, 0, 38.00, 90, 0,
            ['de' => 'Dicht, süss-säuerlich, Noten von Feige und Holz.', 'en' => 'Dense, sweet-sour, notes of fig and wood.'],
            ['de' => 'Parmigiano, Erdbeeren, Vanilleglace', 'en' => 'Parmigiano, strawberries, vanilla ice cream'], null, null, null],
        ['S-3001', 'carnaroli-riserva', 'speciality', 'pasta-reis', 'frantoio-del-lago', 'Riso Carnaroli Riserva 1 kg',
            ['de' => '12 Monate gereift — der Risotto-Reis.', 'en' => 'Aged 12 months — the risotto rice.'],
            null, 'Piemonte', null, null, null, 1000, null, 0, 9.80, 400, 0,
            ['de' => 'Bleibt al dente, nimmt Aromen perfekt auf.', 'en' => 'Stays al dente and absorbs flavours perfectly.'],
            ['de' => 'Risotto alla milanese, ai funghi', 'en' => 'Risotto alla milanese, ai funghi'], null, null, null],
        ['S-3002', 'paccheri-gragnano', 'speciality', 'pasta-reis', 'masseria-terrarossa', 'Paccheri di Gragnano IGP 500 g',
            ['de' => 'Bronzegezogen, langsam getrocknet.', 'en' => 'Bronze-drawn, slowly dried.'],
            null, 'Campania', 'Pasta di Gragnano IGP', null, null, 500, null, 0, 5.90, 500, 0,
            ['de' => 'Raue Oberfläche, hält jede Sauce.', 'en' => 'Rough surface that holds every sauce.'],
            ['de' => 'Ragù napoletano, Meeresfrüchte', 'en' => 'Ragù napoletano, seafood'], null, null, null],
        ['S-4001', 'pomodori-secchi', 'speciality', 'feinkost', 'masseria-terrarossa', 'Pomodori Secchi sott\'olio',
            ['de' => 'Sonnengetrocknete Tomaten in Olivenöl, 280 g.', 'en' => 'Sun-dried tomatoes in olive oil, 280 g.'],
            null, 'Puglia', null, null, null, 280, null, 1, 8.50, 300, 0,
            ['de' => 'Intensiv, süsslich, mit Oregano und Kapern.', 'en' => 'Intense, sweet, with oregano and capers.'],
            ['de' => 'Antipasti, Panini, Pasta', 'en' => 'Antipasti, panini, pasta'], null, null, null],
        ['G-1001', 'grappa-di-amarone', 'spirit', 'spirituosen', 'podere-san-lucio', 'Grappa di Amarone Barrique',
            ['de' => '18 Monate Barrique, 50 cl.', 'en' => '18 months in barrique, 50 cl.'],
            null, 'Veneto', null, 'Corvina, Rondinella', null, 500, 42.0, 0, 46.00, 80, 0,
            ['de' => 'Vanille, getrocknete Früchte, Kakao. Weich und warm.', 'en' => 'Vanilla, dried fruit, cocoa. Smooth and warm.'],
            ['de' => 'Nach dem Essen, zu Espresso', 'en' => 'After dinner, with espresso'], '16–18 °C', null, null],
    ];

    $b2b = (int) $db->value("SELECT id FROM customer_groups WHERE code = 'b2b'");
    $gastro = (int) $db->value("SELECT id FROM customer_groups WHERE code = 'gastro'");

    foreach ($products as $p) {
        [$sku, $slug, $type, $c, $prod, $name, $short, $color, $region, $app, $grapes, $vintage, $ml, $alc, $bio,
            $price, $stock, $featured, $tasting, $pairing, $temp, $aging, $rating] = $p;
        $taxClass = $type === 'speciality' ? 'reduced' : 'standard';
        $id = $db->insert('products', [
            'sku' => $sku, 'erp_id' => $sku, 'slug' => $slug, 'type' => $type,
            'category_id' => $cat($c), 'producer_id' => $pid[$prod],
            'name_json' => j(['de' => $name, 'en' => $name, 'it' => $name, 'fr' => $name]),
            'short_json' => j($short), 'description_json' => j($tasting),
            'color' => $color, 'country' => 'Italia', 'region' => $region, 'appellation' => $app,
            'grapes' => $grapes, 'vintage' => $vintage, 'volume_ml' => $ml, 'alcohol' => $alc, 'organic' => $bio,
            'tasting_json' => j($tasting), 'pairing_json' => j($pairing), 'serving_temp' => $temp, 'aging' => $aging,
            'rating' => $rating, 'price_gross' => (int) round($price * 100), 'tax_class' => $taxClass,
            'case_size' => $type === 'speciality' ? 1 : 6, 'stock' => $stock, 'min_qty' => 1,
            'age_restricted' => $type === 'speciality' ? 0 : 1, 'active' => 1, 'featured' => $featured,
            'created_at' => $now,
        ]);

        // Demo B2B tier prices for wines: explicit net list price + case + pallet breaks.
        if ($type === 'wine') {
            $rate = 8.1;
            $net = (int) round($price * 100 / (1 + $rate / 100));
            foreach ([[1, 0.78], [12, 0.75], [60, 0.70]] as [$min, $factor]) {
                $db->insert('prices', ['product_id' => $id, 'customer_group_id' => $b2b, 'min_qty' => $min, 'price_net' => (int) round($net * $factor)]);
            }
            $db->insert('prices', ['product_id' => $id, 'customer_group_id' => $gastro, 'min_qty' => 1, 'price_net' => (int) round($net * 0.74)]);
            $db->insert('prices', ['product_id' => $id, 'customer_group_id' => $gastro, 'min_qty' => 36, 'price_net' => (int) round($net * 0.68)]);
        }
    }

    // Demo B2B customer (approved) for trying the B2B portal.
    $db->insert('users', [
        'email' => 'b2b@example.com',
        'password_hash' => password_hash('b2b-demo', PASSWORD_DEFAULT),
        'name' => 'Marco Demo', 'company' => 'Ristorante Demo AG', 'uid_number' => 'CHE-123.456.789',
        'role' => 'customer', 'customer_group_id' => $gastro, 'b2b_status' => 'approved',
        'billing_json' => j(['company' => 'Ristorante Demo AG', 'name' => 'Marco Demo', 'street' => 'Bahnhofstrasse 1', 'zip' => '8001', 'city' => 'Zürich', 'country' => 'CH']),
        'created_at' => $now,
    ]);
    $db->insert('users', [
        'email' => 'kunde@example.com',
        'password_hash' => password_hash('kunde-demo', PASSWORD_DEFAULT),
        'name' => 'Anna Muster', 'role' => 'customer',
        'customer_group_id' => (int) $db->value("SELECT id FROM customer_groups WHERE code = 'retail'"),
        'billing_json' => j(['name' => 'Anna Muster', 'street' => 'Musterweg 5', 'zip' => '3011', 'city' => 'Bern', 'country' => 'CH']),
        'created_at' => $now,
    ]);
}
