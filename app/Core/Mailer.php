<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Mail drivers:
 *  - log  : writes to storage/logs/mail.log (development)
 *  - mail : PHP mail() — works on most shared hosters out of the box
 *  - smtp : minimal SMTP client (SSL/STARTTLS + AUTH LOGIN), no dependencies
 */
final class Mailer
{
    public function __construct(private array $cfg, private View $view)
    {
    }

    public function sendTemplate(string $to, string $subject, string $template, array $data = []): bool
    {
        $html = $this->view->render('emails/' . $template, $data + ['subject' => $subject], 'emails/layout');
        return $this->send($to, $subject, $html);
    }

    public function send(string $to, string $subject, string $html, ?string $replyTo = null): bool
    {
        $from = $this->cfg['from'] ?? 'shop@example.com';
        $fromName = $this->cfg['from_name'] ?? 'Shop';
        $driver = $this->cfg['driver'] ?? 'log';

        try {
            return match ($driver) {
                'mail' => $this->viaMail($to, $subject, $html, $from, $fromName, $replyTo),
                'smtp' => $this->viaSmtp($to, $subject, $html, $from, $fromName, $replyTo),
                default => $this->viaLog($to, $subject, $html),
            };
        } catch (\Throwable $e) {
            error_log('[mail] ' . $e->getMessage());
            return false;
        }
    }

    private function headers(string $from, string $fromName, ?string $replyTo): array
    {
        $h = [
            'MIME-Version' => '1.0',
            'Content-Type' => 'text/html; charset=UTF-8',
            'From' => sprintf('=?UTF-8?B?%s?= <%s>', base64_encode($fromName), $from),
            'Date' => date('r'),
            'Message-ID' => sprintf('<%s@%s>', bin2hex(random_bytes(8)), substr(strrchr($from, '@') ?: '@shop', 1)),
        ];
        if ($replyTo) {
            $h['Reply-To'] = $replyTo;
        }
        return $h;
    }

    private function viaLog(string $to, string $subject, string $html): bool
    {
        $line = sprintf("[%s] To: %s | Subject: %s\n%s\n\n", date('c'), $to, $subject, strip_tags($html));
        return (bool) file_put_contents(BASE_PATH . '/storage/logs/mail.log', $line, FILE_APPEND);
    }

    private function viaMail(string $to, string $subject, string $html, string $from, string $fromName, ?string $replyTo): bool
    {
        $subj = '=?UTF-8?B?' . base64_encode($subject) . '?=';
        return mail($to, $subj, $html, $this->headers($from, $fromName, $replyTo), '-f' . $from);
    }

    private function viaSmtp(string $to, string $subject, string $html, string $from, string $fromName, ?string $replyTo): bool
    {
        $host = $this->cfg['smtp']['host'] ?? 'localhost';
        $port = (int) ($this->cfg['smtp']['port'] ?? 587);
        $enc = $this->cfg['smtp']['encryption'] ?? 'tls'; // tls | ssl | none
        $remote = ($enc === 'ssl' ? 'ssl://' : 'tcp://') . $host . ':' . $port;
        $fp = stream_socket_client($remote, $errno, $errstr, 15);
        if (!$fp) {
            throw new \RuntimeException("SMTP connect failed: $errstr");
        }
        $read = function () use ($fp): string {
            $data = '';
            while (($line = fgets($fp, 515)) !== false) {
                $data .= $line;
                if (isset($line[3]) && $line[3] === ' ') {
                    break;
                }
            }
            return $data;
        };
        $cmd = function (string $c, array $ok) use ($fp, $read): string {
            fwrite($fp, $c . "\r\n");
            $r = $read();
            if (!in_array((int) substr($r, 0, 3), $ok, true)) {
                throw new \RuntimeException("SMTP error on '$c': $r");
            }
            return $r;
        };
        $read();
        $ehlo = 'EHLO ' . (gethostname() ?: 'localhost');
        $cmd($ehlo, [250]);
        if ($enc === 'tls') {
            $cmd('STARTTLS', [220]);
            stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT);
            $cmd($ehlo, [250]);
        }
        if (!empty($this->cfg['smtp']['user'])) {
            $cmd('AUTH LOGIN', [334]);
            $cmd(base64_encode($this->cfg['smtp']['user']), [334]);
            $cmd(base64_encode((string) ($this->cfg['smtp']['pass'] ?? '')), [235]);
        }
        $cmd("MAIL FROM:<$from>", [250]);
        $cmd("RCPT TO:<$to>", [250, 251]);
        $cmd('DATA', [354]);
        $headers = $this->headers($from, $fromName, $replyTo) + [
            'To' => $to,
            'Subject' => '=?UTF-8?B?' . base64_encode($subject) . '?=',
        ];
        $msg = '';
        foreach ($headers as $k => $v) {
            $msg .= "$k: $v\r\n";
        }
        $body = preg_replace('/^\./m', '..', str_replace(["\r\n", "\n"], "\r\n", $html));
        $cmd($msg . "\r\n" . $body . "\r\n.", [250]);
        $cmd('QUIT', [221]);
        fclose($fp);
        return true;
    }
}
