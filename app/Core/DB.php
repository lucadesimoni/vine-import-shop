<?php
declare(strict_types=1);

namespace App\Core;

use PDO;
use PDOStatement;

/**
 * Thin PDO wrapper. Works with SQLite (zero-config default) and MySQL/MariaDB
 * (what most shared hosters provide). PostgreSQL works for queries too.
 */
final class DB
{
    public readonly PDO $pdo;
    public readonly string $driver;

    public function __construct(array $cfg)
    {
        $this->driver = $cfg['driver'] ?? 'sqlite';
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ];

        if ($this->driver === 'sqlite') {
            $path = $cfg['path'] ?? BASE_PATH . '/storage/database.sqlite';
            if (!is_dir(dirname($path))) {
                mkdir(dirname($path), 0775, true);
            }
            $this->pdo = new PDO('sqlite:' . $path, null, null, $options);
            $this->pdo->exec('PRAGMA foreign_keys = ON');
            $this->pdo->exec('PRAGMA journal_mode = WAL');
        } else {
            $dsn = sprintf(
                '%s:host=%s;port=%s;dbname=%s%s',
                $this->driver,
                $cfg['host'] ?? 'localhost',
                $cfg['port'] ?? ($this->driver === 'pgsql' ? '5432' : '3306'),
                $cfg['name'] ?? 'shop',
                $this->driver === 'mysql' ? ';charset=' . ($cfg['charset'] ?? 'utf8mb4') : ''
            );
            $this->pdo = new PDO($dsn, $cfg['user'] ?? 'root', $cfg['pass'] ?? '', $options);
        }
    }

    public function run(string $sql, array $params = []): PDOStatement
    {
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt;
    }

    public function all(string $sql, array $params = []): array
    {
        return $this->run($sql, $params)->fetchAll();
    }

    public function one(string $sql, array $params = []): ?array
    {
        $row = $this->run($sql, $params)->fetch();
        return $row === false ? null : $row;
    }

    public function value(string $sql, array $params = []): mixed
    {
        $v = $this->run($sql, $params)->fetchColumn();
        return $v === false ? null : $v;
    }

    public function insert(string $table, array $data): int
    {
        $cols = array_keys($data);
        $sql = sprintf(
            'INSERT INTO %s (%s) VALUES (%s)',
            $table,
            implode(', ', $cols),
            implode(', ', array_fill(0, count($cols), '?'))
        );
        $this->run($sql, array_values($data));
        return (int) $this->pdo->lastInsertId();
    }

    public function update(string $table, array $data, string $where, array $params = []): int
    {
        $set = implode(', ', array_map(fn ($c) => "$c = ?", array_keys($data)));
        return $this->run("UPDATE $table SET $set WHERE $where", [...array_values($data), ...$params])->rowCount();
    }

    public function transaction(callable $fn): mixed
    {
        $this->pdo->beginTransaction();
        try {
            $result = $fn($this);
            $this->pdo->commit();
            return $result;
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    public function tableExists(string $table): bool
    {
        try {
            $this->pdo->query("SELECT 1 FROM $table LIMIT 1");
            return true;
        } catch (\PDOException) {
            return false;
        }
    }

    public static function now(): string
    {
        return date('Y-m-d H:i:s');
    }
}
