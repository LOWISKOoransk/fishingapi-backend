const db = new sqlite3.Database('./spots.db', (err) => {
  if (err) {
    console.error('Error connecting to database:', err.message);
  } else {
    console.log('Connected to database');
  }
}); 