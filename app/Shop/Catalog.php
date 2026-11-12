<?php
declare(strict_types=1);

namespace App\Shop;

use App\Core\DB;

/** Catalog queries: filtering, faceting, search. */
final class Catalog
{
    public function __construct(private DB $db)
    {
    }

    private const BASE = 'SELECT p.*, c.slug AS category_slug, c.name_json AS category_name, pr.name AS producer_name, pr.slug AS producer_slug
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        LEFT JOIN producers pr ON pr.id = p.producer_id';

    /**
     * @param array $f filters: category, type, color, region, producer, grape, organic, q, min, max, sort, vintage
     * @return array{items:array,total:int,page:int,pages:int}
     */
    public function search(array $f, bool $isB2B, int $page = 1, int $perPage = 24): array
    {
        $where = ['p.active = 1'];
        $params = [];
        if (!$isB2B) {
            $where[] = 'p.b2b_only = 0';
        }
        if (!empty($f['category'])) {
            $where[] = 'c.slug = ?';
            $params[] = $f['category'];
        }
        if (!empty($f['type'])) {
            $where[] = 'p.type = ?';
            $params[] = $f['type'];
        }
        foreach (['color' => 'p.color', 'region' => 'p.region', 'producer' => 'pr.slug', 'vintage' => 'p.vintage'] as $key => $col) {
            if (!empty($f[$key])) {
                $vals = array_values(array_filter((array) $f[$key], 'is_string'));
                if ($vals) {
                    $where[] = "$col IN (" . implode(',', array_fill(0, count($vals), '?')) . ')';
                    array_push($params, ...$vals);
                }
            }
        }
        if (!empty($f['grape'])) {
            $where[] = 'LOWER(p.grapes) LIKE ?';
            $params[] = '%' . mb_strtolower((string) $f['grape']) . '%';
        }
        if (!empty($f['organic'])) {
            $where[] = 'p.organic = 1';
        }
        if (!empty($f['instock'])) {
            $where[] = 'p.stock > 0';
        }
        if (isset($f['min']) && is_numeric($f['min'])) {
            $where[] = 'p.price_gross >= ?';
            $params[] = (int) ((float) $f['min'] * 100);
        }
        if (isset($f['max']) && is_numeric($f['max']) && $f['max'] !== '') {
            $where[] = 'p.price_gross <= ?';
            $params[] = (int) ((float) $f['max'] * 100);
        }
        if (!empty($f['q'])) {
            $q = '%' . mb_strtolower(trim((string) $f['q'])) . '%';
            $where[] = '(LOWER(p.name_json) LIKE ? OR LOWER(p.sku) LIKE ? OR LOWER(p.grapes) LIKE ? OR LOWER(p.region) LIKE ? OR LOWER(pr.name) LIKE ? OR LOWER(p.appellation) LIKE ?)';
            array_push($params, $q, $q, $q, $q, $q, $q);
        }

        $order = match ($f['sort'] ?? '') {
            'price_asc' => 'p.price_gross ASC',
            'price_desc' => 'p.price_gross DESC',
            'vintage' => 'p.vintage DESC',
            'name' => 'p.name_json ASC',
            'new' => 'p.id DESC',
            default => 'p.featured DESC, c.sort ASC, p.price_gross DESC',
        };

        $sqlWhere = ' WHERE ' . implode(' AND ', $where);
        $total = (int) $this->db->value('SELECT COUNT(*) FROM products p LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN producers pr ON pr.id = p.producer_id' . $sqlWhere, $params);
        $pages = max(1, (int) ceil($total / $perPage));
        $page = min(max(1, $page), $pages);
        $items = $this->db->all(self::BASE . $sqlWhere . " ORDER BY $order LIMIT " . (int) $perPage . ' OFFSET ' . (int) (($page - 1) * $perPage), $params);

        return ['items' => $items, 'total' => $total, 'page' => $page, 'pages' => $pages];
    }

    /** Facet values for filter UI. */
    public function facets(?string $type = null): array
    {
        $cond = $type ? ' AND p.type = ?' : '';
        $params = $type ? [$type] : [];
        return [
            'colors' => array_column($this->db->all("SELECT DISTINCT color FROM products p WHERE active = 1 AND color IS NOT NULL$cond ORDER BY color", $params), 'color'),
            'regions' => array_column($this->db->all("SELECT DISTINCT region FROM products p WHERE active = 1 AND region IS NOT NULL$cond ORDER BY region", $params), 'region'),
            'producers' => $this->db->all("SELECT DISTINCT pr.slug, pr.name FROM producers pr JOIN products p ON p.producer_id = pr.id WHERE p.active = 1$cond ORDER BY pr.name", $params),
            'vintages' => array_column($this->db->all("SELECT DISTINCT vintage FROM products p WHERE active = 1 AND vintage IS NOT NULL AND vintage <> 'NV'$cond ORDER BY vintage DESC", $params), 'vintage'),
        ];
    }

    public function bySlug(string $slug): ?array
    {
        return $this->db->one(self::BASE . ' WHERE p.slug = ? AND p.active = 1', [$slug]);
    }

    public function bySku(string $sku): ?array
    {
        return $this->db->one(self::BASE . ' WHERE p.sku = ?', [$sku]);
    }

    public function featured(int $limit = 8): array
    {
        return $this->db->all(self::BASE . ' WHERE p.active = 1 AND p.featured = 1 AND p.b2b_only = 0 ORDER BY p.id LIMIT ' . $limit);
    }

    public function related(array $p, int $limit = 4): array
    {
        return $this->db->all(
            self::BASE . ' WHERE p.active = 1 AND p.id <> ? AND (p.producer_id = ? OR p.category_id = ?) AND p.b2b_only = 0 ORDER BY CASE WHEN p.producer_id = ? THEN 0 ELSE 1 END, p.featured DESC LIMIT ' . $limit,
            [$p['id'], $p['producer_id'], $p['category_id'], $p['producer_id']]
        );
    }

    public function categories(?string $type = null): array
    {
        return $type
            ? $this->db->all('SELECT * FROM categories WHERE type = ? ORDER BY sort', [$type])
            : $this->db->all('SELECT * FROM categories ORDER BY sort');
    }

    public function category(string $slug): ?array
    {
        return $this->db->one('SELECT * FROM categories WHERE slug = ?', [$slug]);
    }

    public function producers(): array
    {
        return $this->db->all('SELECT pr.*, (SELECT COUNT(*) FROM products p WHERE p.producer_id = pr.id AND p.active = 1) AS product_count FROM producers pr ORDER BY pr.region, pr.name');
    }

    public function producer(string $slug): ?array
    {
        return $this->db->one('SELECT * FROM producers WHERE slug = ?', [$slug]);
    }

    public function byProducer(int $id): array
    {
        return $this->db->all(self::BASE . ' WHERE p.active = 1 AND p.producer_id = ? AND p.b2b_only = 0 ORDER BY p.type, p.price_gross DESC', [$id]);
    }
}
