CREATE TABLE spots (
  id INT PRIMARY KEY AUTO_INCREMENT,
  is_active BOOLEAN NOT NULL DEFAULT 1
);

CREATE TABLE reservations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  first_name VARCHAR(64) NOT NULL,
  last_name VARCHAR(64) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  car_plate VARCHAR(32) NOT NULL,
  email VARCHAR(128) NOT NULL,
  spot_id INT NOT NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_date DATE NOT NULL,
  end_time TIME NOT NULL DEFAULT '10:00:00',
  -- Statusy rezerwacji:
  -- - 'oczekująca' - oczekuje na płatność (15 min)
  -- - 'nieoplacona' - po 15 minutach bez płatności
  -- - 'opłacona' - płatność zrealizowana w ciągu 15 min
  -- - 'anulowana' - anulowana przez admina (tylko z 'opłacona')
  -- - 'zwrot' - zgłoszony przez użytkownika (do 3 dni przed)
  status VARCHAR(32) NOT NULL DEFAULT 'oczekująca',
  token VARCHAR(64) NOT NULL UNIQUE,
  amount DECIMAL(10,2) NOT NULL DEFAULT 70.00,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  payment_id VARCHAR(64),
  notes TEXT,
  FOREIGN KEY (spot_id) REFERENCES spots(id)
);

CREATE TABLE IF NOT EXISTS spot_blocks (
  id INT PRIMARY KEY AUTO_INCREMENT,
  spot_id INT NOT NULL,
  date DATE NOT NULL,
  source VARCHAR(32) NOT NULL DEFAULT 'admin',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (spot_id) REFERENCES spots(id)
); 