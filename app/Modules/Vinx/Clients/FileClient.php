<?php
declare(strict_types=1);

namespace App\Modules\Vinx\Clients;

use App\Modules\Vinx\ErpClient;

/**
 * File-exchange driver: the most robust option for shared hosting.
 * vinX exports CSV files (article master, stock, price lists) into an inbox
 * folder (e.g. via scheduled export + SFTP), and imports orders from an
 * outbox folder (XML/CSV/JSON). Processed inbox files are moved to inbox/processed.
 */
final class FileClient implements ErpClient
{
    public function __construct(private array $cfg)
    {
    }

    private function f(string $key, mixed $default = null): mixed
    {
        return $this->cfg['file'][$key] ?? $default;
    }

    public function ping(): string
    {
        $in = (string) $this->f('inbox');
        $out = (string) $this->f('outbox');
        $ok = is_dir($in) && is_readable($in) && is_dir($out) && is_writable($out);
        if (!$ok) {
            throw new \RuntimeException("Inbox/outbox not accessible: $in / $out");
        }
        $files = array_map('basename', glob($in . '/*.{csv,CSV,xml,json}', GLOB_BRACE) ?: []);
        return 'File exchange OK. Inbox: ' . ($files ? implode(', ', $files) : 'empty');
    }

    private function readCsv(string $type): iterable
    {
        $name = $this->f('files')[$type] ?? "$type.csv";
        $path = rtrim((string) $this->f('inbox'), '/') . '/' . $name;
        if (!is_file($path)) {
            return;
        }
        $enc = (string) $this->f('encoding', 'UTF-8');
        $delim = (string) $this->f('delimiter', ';');
        $fh = fopen($path, 'rb');
        $header = null;
        while (($row = fgetcsv($fh, 0, $delim, '"', '\\')) !== false) {
            if ($row === [null]) {
                continue;
            }
            if ($enc !== 'UTF-8') {
                $row = array_map(fn ($v) => mb_convert_encoding((string) $v, 'UTF-8', $enc), $row);
            }
            if ($header === null) {
                $header = array_map(fn ($h) => trim(preg_replace('/^\xEF\xBB\xBF/', '', (string) $h)), $row);
                continue;
            }
            yield array_combine($header, array_pad(array_slice($row, 0, count($header)), count($header), null));
        }
        fclose($fh);
        $done = dirname($path) . '/processed';
        @mkdir($done, 0775, true);
        @rename($path, $done . '/' . date('Ymd-His') . '-' . $name);
    }

    public function articles(?string $since = null): iterable
    {
        yield from $this->readCsv('articles');
    }

    public function stock(): iterable
    {
        yield from $this->readCsv('stock');
    }

    public function prices(): iterable
    {
        yield from $this->readCsv('prices');
    }

    public function pushOrder(array $payload): string
    {
        $dir = rtrim((string) $this->f('outbox'), '/');
        @mkdir($dir, 0775, true);
        $number = $payload['order']['number'];
        $format = (string) $this->f('order_format', 'xml');
        $file = "$dir/order-$number.$format";
        $content = match ($format) {
            'json' => (string) json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE),
            'csv' => $this->orderCsv($payload),
            default => $this->orderXml($payload),
        };
        if (file_put_contents($file . '.tmp', $content) === false || !rename($file . '.tmp', $file)) {
            throw new \RuntimeException("Cannot write $file");
        }
        return $number;
    }

    public function pushCustomer(array $payload): string
    {
        $dir = rtrim((string) $this->f('outbox'), '/');
        @mkdir($dir, 0775, true);
        $id = 'web-' . $payload['customer']['id'];
        file_put_contents("$dir/customer-$id.json", json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        return $id;
    }

    private function orderXml(array $p): string
    {
        $x = new \SimpleXMLElement('<?xml version="1.0" encoding="UTF-8"?><Bestellung/>');
        $o = $p['order'];
        $h = $x->addChild('Kopf');
        foreach (['number' => 'WebNr', 'created_at' => 'Datum', 'customer_erp_id' => 'KundenNr', 'email' => 'Email', 'payment_method' => 'Zahlungsart',
            'shipping_method' => 'Versandart', 'po_number' => 'Bestellreferenz', 'delivery_date' => 'Wunschtermin', 'total_gross' => 'TotalInkl', 'notes' => 'Bemerkung'] as $k => $tag) {
            $h->addChild($tag, htmlspecialchars((string) ($o[$k] ?? ''), ENT_XML1));
        }
        $h->addChild('Preisliste', (string) ($o['price_list'] ?? ''));
        foreach (['billing' => 'Rechnungsadresse', 'shipping' => 'Lieferadresse'] as $k => $tag) {
            $a = $x->addChild($tag);
            foreach ((array) ($p[$k] ?? []) as $field => $val) {
                $a->addChild(ucfirst((string) $field), htmlspecialchars((string) $val, ENT_XML1));
            }
        }
        $pos = $x->addChild('Positionen');
        foreach ($p['items'] as $i) {
            $l = $pos->addChild('Position');
            $l->addChild('ArtikelNr', htmlspecialchars($i['sku'], ENT_XML1));
            $l->addChild('Menge', (string) $i['qty']);
            $l->addChild('PreisExkl', number_format($i['unit_net'] / 100, 2, '.', ''));
            $l->addChild('PreisInkl', number_format($i['unit_gross'] / 100, 2, '.', ''));
            $l->addChild('MwstSatz', (string) $i['tax_rate']);
        }
        return (string) $x->asXML();
    }

    private function orderCsv(array $p): string
    {
        $fh = fopen('php://temp', 'r+');
        fputcsv($fh, ['WebNr', 'KundenNr', 'ArtikelNr', 'Menge', 'PreisExkl', 'Versandart', 'Zahlungsart', 'Referenz'], ';');
        foreach ($p['items'] as $i) {
            fputcsv($fh, [$p['order']['number'], $p['order']['customer_erp_id'] ?? '', $i['sku'], $i['qty'], number_format($i['unit_net'] / 100, 2, '.', ''), $p['order']['shipping_method'], $p['order']['payment_method'], $p['order']['po_number'] ?? ''], ';');
        }
        rewind($fh);
        return (string) stream_get_contents($fh);
    }
}
