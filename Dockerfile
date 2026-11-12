# Production image: PHP 8.3 + Apache. Works on any container host
# (Fly.io, Render, Railway, Infomaniak Jelastic, Azure, AWS, a VPS …).
FROM php:8.3-apache

RUN apt-get update && apt-get install -y --no-install-recommends libsqlite3-dev libicu-dev libzip-dev \
 && docker-php-ext-install pdo_mysql pdo_sqlite intl opcache \
 && a2enmod rewrite headers expires deflate \
 && rm -rf /var/lib/apt/lists/*

ENV APACHE_DOCUMENT_ROOT=/var/www/html/public
RUN sed -ri -e 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/sites-available/*.conf \
 && sed -ri -e 's!AllowOverride None!AllowOverride All!g' /etc/apache2/apache2.conf \
 && printf "opcache.enable=1\nopcache.validate_timestamps=0\nexpose_php=Off\n" > /usr/local/etc/php/conf.d/shop.ini

WORKDIR /var/www/html
COPY . .
RUN mkdir -p storage/logs storage/sessions storage/cache storage/vinx/inbox storage/vinx/outbox \
 && chown -R www-data:www-data storage

VOLUME ["/var/www/html/storage"]
EXPOSE 80
