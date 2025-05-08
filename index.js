const express = require('express');
const mysql = require('mysql2/promise');

const app = express();
const port = process.env.PORT || 3000;

// Konfigurasi koneksi database
const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '', // Ganti dengan password MySQL Anda
    database: 'conv'
};

app.use(express.json());

// Endpoint '/' untuk menampilkan semua conversion factors
app.get('/', async (req, res) => {
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute("SELECT * FROM conversion_factors");
        await connection.end();
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Terjadi kesalahan pada server." });
    }
});

// Endpoint '/convert' dengan dukungan chain conversion
// Contoh: GET /convert?from=lb&to=g&value=1
app.get('/convert', async (req, res) => {
    const { from, to, value } = req.query;
    
    if (!from || !to || !value) {
        return res.status(400).json({ error: 'Parameter "from", "to", dan "value" harus disertakan.' });
    }
    
    const numericValue = parseFloat(value);
    if (isNaN(numericValue)) {
        return res.status(400).json({ error: 'Parameter "value" harus berupa angka.' });
    }
    
    try {
        const connection = await mysql.createConnection(dbConfig);
        
        // Coba cari konversi langsung
        let [rows] = await connection.execute(
            "SELECT factor FROM conversion_factors WHERE from_unit = ? AND to_unit = ? LIMIT 1",
            [from, to]
        );
        
        if (rows.length > 0) {
            const factor = parseFloat(rows[0].factor);
            const result = numericValue * factor;
            await connection.end();
            return res.json({ 
                from, 
                to, 
                input: numericValue, 
                result,
                method: "direct"
            });
        }
        
        // Jika tidak ditemukan, coba chain conversion untuk unit massa
        // Misalnya, untuk unit: 'kg', 'g', 'lb', 'ons'
        const massUnits = ['kg', 'g', 'lb', 'ons'];
        if (massUnits.includes(from.toLowerCase()) && massUnits.includes(to.toLowerCase())) {
            // Konversi dari "from" ke "kg"
            let [rows1] = await connection.execute(
                "SELECT factor FROM conversion_factors WHERE from_unit = ? AND to_unit = ? LIMIT 1",
                [from, 'kg']
            );
            // Konversi dari "kg" ke "to"
            let [rows2] = await connection.execute(
                "SELECT factor FROM conversion_factors WHERE from_unit = ? AND to_unit = ? LIMIT 1",
                ['kg', to]
            );
            
            if (rows1.length > 0 && rows2.length > 0) {
                const factor1 = parseFloat(rows1[0].factor);
                const factor2 = parseFloat(rows2[0].factor);
                const chainFactor = factor1 * factor2;
                const result = numericValue * chainFactor;
                await connection.end();
                return res.json({ 
                    from, 
                    to, 
                    input: numericValue, 
                    result,
                    method: "chain",
                    detail: {
                        conversionVia: "kg",
                        factor1: factor1,
                        factor2: factor2,
                        chainFactor: chainFactor
                    }
                });
            }
        }
        
        await connection.end();
        return res.status(400).json({ error: `Konversi dari "${from}" ke "${to}" tidak ditemukan.` });
        
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Terjadi kesalahan pada server." });
    }
});

app.listen(port, () => {
    console.log(`Server berjalan di port ${port}`);
});
