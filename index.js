const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

const { ObjectId } = require("mongodb");

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;


app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

app.use(express.json());

const { MongoClient, ServerApiVersion } = require("mongodb");

const uri = process.env.MONGO_DB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const db = client.db(process.env.DB_NAME);

    const usersCollection = db.collection("user");
    const booksCollection = db.collection("books");
    const deliveriesCollection = db.collection("deliveries");
    const reviewsCollection = db.collection("reviews");




    // users related api

    app.post("/users", async (req, res) => {
  try {
    const user = req.body;

    const existingUser = await usersCollection.findOne({
      email: user.email,
    });

    if (existingUser) {
      return res.send({
        message: "User already exists",
        inserted: false,
      });
    }

    const result = await usersCollection.insertOne(user);

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: error.message,
    });
  }
});


   app.get("/users", async (req, res) => {
  try {
    const result = await usersCollection.find().toArray();

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: error.message,
    });
  }
});


   app.get("/users/:email", async (req, res) => {
  try {
    const email = req.params.email;

    const result = await usersCollection.findOne({
      email,
    });

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: error.message,
    });
  }
});



   // BOOKS Related API

   app.post("/books", async (req, res) => {
     const book = req.body;
   
     const newBook = {
       ...book,
   
       status: "Pending Approval",
       createdAt: new Date()
     };   
     const result = await booksCollection.insertOne(newBook);   
     res.send(result);
   });


   app.get("/books", async (req, res) => {

      const result = await booksCollection.find().toArray();

      res.send(result);
    });


    app.get("/books/:id", async(req,res)=>{

        const id = req.params.id;

        const result = await booksCollection.findOne({
            _id: new ObjectId(id)
          });
      
        res.send(result);
    });


    app.patch("/books/:id", async(req,res)=>{

      const id = req.params.id;

      const updatedBook = req.body;

      const result = await booksCollection.updateOne(
          {
            _id:new ObjectId(id)
          },

          {
            $set: updatedBook
          }
        );

      res.send(result);
    });


    app.delete("/books/:id", async(req,res)=>{

       const id = req.params.id;
            
       const result = await booksCollection.deleteOne({
        _id:new ObjectId(id)
       });
       
       res.send(result);
    });






    app.get("/", (req, res) => {
      res.send("BiblioDrop Server Running");
    });

    await client.db("admin").command({ ping: 1 });

    console.log("MongoDB Connected Successfully");
  } finally {
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});