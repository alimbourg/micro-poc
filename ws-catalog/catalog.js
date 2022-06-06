const initOptions = {/* initialization options */};
const pgp = require('pg-promise')(initOptions);
const connectionString = 'postgresql://root:rootroot@127.0.0.1:65432/nt';

// Creating a new database instance from the connection details:
const db = pgp(connectionString);

db.connect()
.then(() =>{
    return Promise.all([db.query('SELECT NOW()'),db.query('SELECT * from nt_product')]);
})
.then((res) => {
    console.log(res);
});
  
/*
const { Pool, Client } = require('pg')



const pool = new Pool({
  connectionString,
});

// pool.connect()
const res = pool.query('SELECT $1::text as message', ['Hello world!'], (err, res) => {
    console.log(res.rows[0].message) // Hello world!
    pool.end()
});
*/
/*
const client = new Client({
    connectionString,
  })
  console.log('connecting to '+connectionString);
  
client.connect()
.then(() => {
    return client.query('SELECT NOW()', (err, res) => {
        console.log(err, res)
    });
});
*/