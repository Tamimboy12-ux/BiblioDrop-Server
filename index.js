const dns = require("dns")
dns.setServers(['8.8.8.8', '8.8.4.4'])

const express = require('express');
const app = express()
const dotenv = require("dotenv")
dotenv.config()

const port = 5000






const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = process.env.MONGO_DB_URI

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {

    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {

    // await client.close();
  }
}
run().catch(console.dir);







app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})