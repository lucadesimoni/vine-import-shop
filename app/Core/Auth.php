<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Session auth. Roles: customer | admin.
 * B2B = user in a customer group flagged is_b2b AND b2b_status = 'approved'.
 */
final class Auth
{
    private static ?Auth $instance = null;
    private ?array $user = null;
    private bool $loaded = false;
    private ?array $group = null;

    public function __construct(private DB $db)
    {
    }

    public static function instance(): self
    {
        return self::$instance ??= new self(App::instance()->db());
    }

    public static function reset(): void
    {
        self::$instance = null;
    }

    public function user(): ?array
    {
        if (!$this->loaded) {
            $this->loaded = true;
            $id = Session::get('user_id');
            $this->user = $id ? $this->db->one('SELECT * FROM users WHERE id = ?', [$id]) : null;
        }
        return $this->user;
    }

    public function id(): ?int
    {
        return isset($this->user()['id']) ? (int) $this->user()['id'] : null;
    }

    public function check(): bool
    {
        return $this->user() !== null;
    }

    public function isAdmin(): bool
    {
        return ($this->user()['role'] ?? '') === 'admin';
    }

    public function isB2B(): bool
    {
        $u = $this->user();
        return $u !== null && ($u['b2b_status'] ?? '') === 'approved' && (int) ($this->group()['is_b2b'] ?? 0) === 1;
    }

    /** The pricing group of the current visitor (guests = retail). */
    public function group(): array
    {
        if ($this->group === null) {
            $u = $this->user();
            $row = null;
            if ($u && $u['customer_group_id'] && (($u['b2b_status'] ?? null) === 'approved' || ($u['b2b_status'] ?? null) === null)) {
                $row = $this->db->one('SELECT * FROM customer_groups WHERE id = ?', [$u['customer_group_id']]);
            }
            $this->group = $row ?? $this->db->one("SELECT * FROM customer_groups WHERE code = 'retail'") ?? [
                'id' => 0, 'code' => 'retail', 'name' => 'Retail', 'is_b2b' => 0, 'price_display' => 'gross', 'discount_percent' => 0,
            ];
        }
        return $this->group;
    }

    public function attempt(string $email, string $password): bool
    {
        $u = $this->db->one('SELECT * FROM users WHERE email = ?', [mb_strtolower(trim($email))]);
        if (!$u || !password_verify($password, (string) $u['password_hash'])) {
            return false;
        }
        if (password_needs_rehash((string) $u['password_hash'], PASSWORD_DEFAULT)) {
            $this->db->update('users', ['password_hash' => password_hash($password, PASSWORD_DEFAULT)], 'id = ?', [$u['id']]);
        }
        $this->login((int) $u['id']);
        return true;
    }

    public function login(int $userId): void
    {
        Session::regenerate();
        Session::set('user_id', $userId);
        $this->loaded = false;
        $this->group = null;
    }

    public function logout(): void
    {
        Session::forget('user_id');
        Session::regenerate();
        $this->user = null;
        $this->loaded = true;
        $this->group = null;
    }
}
