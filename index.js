const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const Stripe = require("stripe");

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

const { ObjectId } = require("mongodb");

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);


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
    const transactionsCollection = db.collection("transactions");
    const reviewsCollection = db.collection("reviews");



    // users related api

    app.get("/admin/users", async (req, res) => {
      try {
        const result = await usersCollection.find().toArray();
         
        res.send(result);
      } catch (error) {
        res.status(500).send({
          message: error.message,
        });
      }
    });


    app.patch("/admin/users/role/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const {role} = req.body

        const result = await usersCollection.updateOne(
            {
                _id:new ObjectId(id)
            },

            {
                $set:{
                    role
                }
            }
        )

        res.send(result);

      } catch (error) {
        res.status(500).send({
          message: error.message,
        });
      }
    });


    app.delete("/admin/users/:id", async(req,res)=>{  
        try{
            const id=req.params.id;

            const result = await usersCollection.deleteOne({
                _id:new ObjectId(id)
            });

            res.send(result);

            } catch(error){
                res.status(500).send({
                 message:error.message
              })
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


    // published books only

   app.get("/published-books", async (req, res) => {

      const result = await booksCollection.find({
         status: "Published",
      }).toArray();

      res.send(result);
    });



    app.get("/books/librarian/:email", async (req, res) => {
      const email = req.params.email;

      const result = await booksCollection
        .find({
          librarianEmail: email,
        })
        .toArray();

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


    app.patch("/books/status/:id", async (req, res) => {
      const id = req.params.id;

      const { status } = req.body;

      const result =
        await booksCollection.updateOne(
          {
            _id: new ObjectId(id),
          },
          {
            $set: {
              status,
            },
          }
        );

      res.send(result);
    });


    app.delete("/books/:id", async(req,res)=>{

       const id = req.params.id;

       if(!ObjectId.isValid(id)){
          return res.status(400).send({
            message:"Invalid book id"
          });
       }
            
       const result = await booksCollection.deleteOne({
        _id:new ObjectId(id)
       });
       
       res.send(result);
    });



    // Get pending approval books (Admin)

    app.get("/books/pending", async (req, res) => {
      try {
        const result = await booksCollection.find({
            status: "Pending Approval"
          }).toArray();

        console.log("result", result)  

        res.send(result);

      } catch (error) {
        res.status(500).send({
          message: error.message
        });

      }
    });



    app.patch("/books/approve/:id", async(req,res)=>{
        try{
         const id = req.params.id;
          
         const result = await booksCollection.updateOne(
            {
             _id:new ObjectId(id)
            },
            {
             $set:{
               status:"Published"
             }
            }
         );
     
         res.send(result);
     
        } catch(error){
            res.status(500).send({
            message:error.message
          })
     
        }
    });


    // admin stats

    app.get("/admin/stats", async (req, res) => {
      try {
        const totalUsers = await usersCollection.countDocuments();

        const totalBooks = await booksCollection.countDocuments();

        const totalDeliveries = await deliveriesCollection.countDocuments();

        const deliveries = await deliveriesCollection.find().toArray();

        const totalRevenue = deliveries.reduce(
            (sum, item) =>
              sum + (item.amount || 0),
            0
          );

        const books = await booksCollection.find().toArray();

        const categoryMap = {};

        books.forEach((book) => {

          if (!categoryMap[book.category]) {
            categoryMap[book.category] = 0;
          }

          categoryMap[book.category]++;
        });

        const categoryData = Object.entries(categoryMap).map(
            ([name, value]) => ({
              name,
              value,
            })
          );

        res.send({ totalUsers, totalBooks, totalDeliveries, totalRevenue, categoryData,});

      } catch (error) {

        res.status(500).send({
          message: error.message,
        });

      }
    });



    // Create Delivery Request

    app.post("/deliveries", async (req, res) => {
      try {
        const delivery = req.body;

        const newDelivery = {
          ...delivery,
          status: "Pending",
          requestDate: new Date(),
        };

        const result = await deliveriesCollection.insertOne(
            newDelivery
          );

        res.send(result);

      } catch (error) {
        res.status(500).send({
          message: error.message,
        });

      }
    });


    // transaction related api

    app.post("/create-payment-intent", async (req, res) => {
        try {
          const { amount } = req.body;

          const paymentIntent = await stripe.paymentIntents.create({
              amount: amount * 100,
              currency: "usd",
              payment_method_types: [
                "card",
              ],
            });

          res.send({
            clientSecret:
              paymentIntent.client_secret,
          });

        } catch (error) {

          res.status(500).send({
            message:
              error.message,
          });
        }
      }
    );


    app.post("/transactions", async (req, res) => {
        const transaction = req.body;

        const result = await transactionsCollection.insertOne(transaction);

        res.send(result);
      }
    );




    app.get("/books/:id", async(req,res)=>{

        const id = req.params.id;

        const result = await booksCollection.findOne({
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