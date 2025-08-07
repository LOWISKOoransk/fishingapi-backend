-- Kompletna baza danych dla Łowisko Młyn Rańsk
-- Importuj ten plik na lh.pl aby utworzyć wszystkie tabele i dane

-- Usuń bazy danych jeśli istnieją (dla czystego startu)
DROP DATABASE IF EXISTS fishing;
CREATE DATABASE fishing CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE fishing;

-- Tabela stanowisk wędkarskich
CREATE TABLE spots (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) DEFAULT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Tabela rezerwacji
CREATE TABLE reservations (
    id INT PRIMARY KEY AUTO_INCREMENT,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    car_plate VARCHAR(20) NOT NULL,
    email VARCHAR(255) NOT NULL,
    spot_id INT NOT NULL,
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_date DATE NOT NULL,
    end_time TIME NOT NULL,
    status ENUM('oczekująca', 'opłacona', 'nieoplacona', 'anulowana', 'platnosc_w_toku', 'zwrot_zgloszony', 'anulowana_admin', 'zwrot_zrealizowany', 'zwrot_admin_zrealizowany') DEFAULT 'oczekująca',
    token VARCHAR(255) UNIQUE NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_id VARCHAR(255) DEFAULT NULL,
    p24_token VARCHAR(255) DEFAULT NULL,
    p24_order_id INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (spot_id) REFERENCES spots(id)
);

-- Tabela blokad stanowisk
CREATE TABLE spot_blocks (
    id INT PRIMARY KEY AUTO_INCREMENT,
    spot_id INT NOT NULL,
    date DATE NOT NULL,
    source VARCHAR(32) NOT NULL DEFAULT 'admin',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (spot_id) REFERENCES spots(id)
);

-- Dodaj dane stanowisk
INSERT INTO spots (id, name, is_active) VALUES
(1, 'Stanowisko 1', TRUE),
(2, 'Stanowisko 2', TRUE),
(3, 'Stanowisko 3', TRUE),
(4, 'Stanowisko 4', TRUE),
(5, 'Stanowisko 5', TRUE),
(6, 'Stanowisko 6', TRUE),
(7, 'Stanowisko 7', TRUE),
(8, 'Stanowisko 8', TRUE),
(9, 'Stanowisko 9', TRUE),
(10, 'Stanowisko 10', TRUE);

-- Utwórz indeksy dla lepszej wydajności
CREATE INDEX idx_reservations_token ON reservations(token);
CREATE INDEX idx_reservations_status ON reservations(status);
CREATE INDEX idx_reservations_date ON reservations(date);
CREATE INDEX idx_reservations_spot_id ON reservations(spot_id);
CREATE INDEX idx_reservations_payment_id ON reservations(payment_id);
CREATE INDEX idx_spot_blocks_spot_date ON spot_blocks(spot_id, date);
CREATE INDEX idx_spot_blocks_date ON spot_blocks(date);

-- Dodaj komentarze do tabel
ALTER TABLE spots COMMENT = 'Stanowiska wędkarskie';
ALTER TABLE reservations COMMENT = 'Rezerwacje stanowisk';
ALTER TABLE spot_blocks COMMENT = 'Blokady stanowisk (admin, reservation, paid_reservation)';

-- Sprawdź czy wszystko zostało utworzone poprawnie
SELECT 'Baza danych została utworzona pomyślnie!' as status;
SELECT COUNT(*) as liczba_stanowisk FROM spots;
SELECT COUNT(*) as liczba_rezerwacji FROM reservations;
SELECT COUNT(*) as liczba_blokad FROM spot_blocks;
