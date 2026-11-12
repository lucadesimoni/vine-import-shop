<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Creates the schema on first run (no SSH needed on shared hosting) and,
 * optionally, demo data. Admin credentials come from config/env; if no
 * password is configured a random one is written to storage/ADMIN_PASSWORD.txt
 * (storage/ is not web-accessible).
 */
final class Installer
{
    private static bool $checked = false;

    public static function ensure(App $app): void
    {
        if (self::$checked) {
            return;
        }
        self::$checked = true;
        if (!(bool) $app->config->get('install.auto', true)) {
            return;
        }
        $db = $app->db();
        if ($db->tableExists('settings')) {
            return;
        }
        self::install($app, (bool) $app->config->get('install.demo_data', true));
    }

    public static function install(App $app, bool $demo): array
    {
        $db = $app->db();
        $sql = (string) file_get_contents(BASE_PATH . '/database/schema.sql');
        $pk = match ($db->driver) {
            'mysql' => 'INT UNSIGNED AUTO_INCREMENT PRIMARY KEY',
            'pgsql' => 'SERIAL PRIMARY KEY',
            default => 'INTEGER PRIMARY KEY AUTOINCREMENT',
        };
        $engine = $db->driver === 'mysql' ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci' : '';
        $sql = str_replace(['{{PK}}', '{{ENGINE}}'], [$pk, $engine], $sql);
        $sql = preg_replace('/^--.*$/m', '', $sql);

        foreach (array_filter(array_map('trim', explode(';', (string) $sql))) as $statement) {
            $db->pdo->exec($statement);
        }

        $email = (string) $app->config->get('install.admin_email', 'admin@example.com');
        $password = (string) $app->config->get('install.admin_password', '');
        $generated = false;
        if ($password === '') {
            $password = rtrim(strtr(base64_encode(random_bytes(12)), '+/', '-_'), '=');
            $generated = true;
        }

        require_once BASE_PATH . '/database/seed.php';
        \seed_base($db);
        if ($demo) {
            \seed_demo($db);
        }

        $db->insert('users', [
            'email' => mb_strtolower($email),
            'password_hash' => password_hash($password, PASSWORD_DEFAULT),
            'name' => 'Administrator',
            'role' => 'admin',
            'customer_group_id' => $db->value("SELECT id FROM customer_groups WHERE code = 'retail'"),
            'created_at' => DB::now(),
        ]);
        if ($generated) {
            file_put_contents(
                BASE_PATH . '/storage/ADMIN_PASSWORD.txt',
                "Admin login: $email\nPassword: $password\n\nChange it after first login and delete this file.\n"
            );
        }
        $db->insert('settings', ['name' => 'installed_at', 'value' => DB::now()]);

        return ['email' => $email, 'password' => $generated ? $password : '(from config)'];
    }
}
