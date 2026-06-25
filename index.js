const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const Stripe = require("stripe");

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");


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

app.use(cookieParser());

const { MongoClient, ServerApiVersion } = require("mongodb");

const uri = process.env.MONGO_DB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});



const verifyToken = ( req, res, next)=> {
      const token = req.cookies?.token;

      if (!token) {
        return res.status(401).send({
            message:"Unauthorized",
          });
      }

      jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
          if (err) {
            return res.status(401).send({
                message:"Unauthorized",
              });
          }

          req.user = decoded;

          next();
        }
      );
    };



async function run() {
  try {
    await client.connect();

    const db = client.db(process.env.DB_NAME);

    const usersCollection = db.collection("user");
    const booksCollection = db.collection("books");
    const deliveriesCollection = db.collection("deliveries");
    const transactionsCollection = db.collection("transactions");
    const reviewsCollection = db.collection("reviews");



    // JWT

    app.post("/jwt", async (req, res) => {
      const { email } = req.body;

      const existingUser = await usersCollection.findOne({email,});

      if (!existingUser) {
        return res.status(404).send({
          message: "User not found",
        });
      }

      const token = jwt.sign(
        {
          email: existingUser.email,
          role: existingUser.role,
        },
        process.env.JWT_SECRET,
        {
          expiresIn: "7d",
        }
      );

      res.cookie("token", token, {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
      });

      res.send({
        success: true,
      });
    });


    app.post("/logout", (req, res) => {
      res.clearCookie("token", {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
      });

      res.send({
        success: true,
      });
    });



    const verifyAdmin = async ( req, res, next ) => {
        const email = req.user.email;

        const user = await usersCollection.findOne({email,});

        if (!user || user.role !== "admin") {
            return res.status(403).send({
                message: "Forbidden",
            });
        }

        next();
    };





    // users related api

    app.get("/admin/users", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const result = await usersCollection.find().toArray();
         
        res.send(result);
      } catch (error) {
        res.status(500).send({
          message: error.message,
        });
      }
    });


    app.patch("/admin/users/role/:id", verifyToken, verifyAdmin, async (req, res) => {
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


    app.delete("/admin/users/:id", verifyToken, verifyAdmin, async(req,res)=>{  
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

   app.post("/books", verifyToken, async (req, res) => {
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
        try {

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 6;
        const skip = (page - 1) * limit;
        const search = req.query.search || "";
        const category = req.query.category || "";
        const minFee = parseInt(req.query.minFee) || 0;
        const maxFee = parseInt(req.query.maxFee) || 999999;
        const query = {status: "Published",};

        if (search) {
          query.title = {
            $regex: search,
            $options: "i",
          };
        }

        if (category) {
          query.category = category;
        }

        query.deliveryFee = {
          $gte: minFee,
          $lte: maxFee,
        };

        const totalBooks = await booksCollection.countDocuments(query);

        const books = await booksCollection.find(query).skip(skip).limit(limit).toArray();

        res.send({
          books,
          totalBooks,
          totalPages: Math.ceil(totalBooks / limit),
          currentPage: page,
        });

        } catch (error) {
        res.status(500).send({
          message: error.message,
        });
      }
    });



    app.get("/featured-books", async (req, res) => {
        try {
          const result = await booksCollection.find({
                status: "Published",
              })
              .sort({
                createdAt: -1,
              }).limit(6).toArray();

          res.send(result);

        } catch (error) {
          res.status(500).send({
            message: error.message,
          });
        }
      }
    );




    app.get("/books/librarian/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (
          req.user.email !== email
        ) {
          return res.status(403).send({
            message: "Forbidden",
          });
        }

      const result = await booksCollection
        .find({
          librarianEmail: email,
        })
        .toArray();

      res.send(result);
    });


    app.patch("/books/:id", verifyToken, async(req,res)=>{

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


    app.patch("/books/status/:id", verifyToken, async (req, res) => {
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


    app.delete("/books/:id", verifyToken, async(req,res)=>{

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

    app.get("/books/pending", verifyToken, verifyAdmin, async (req, res) => {
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



    app.patch("/books/approve/:id", verifyToken, verifyAdmin, async(req,res)=>{
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



    // Create Delivery Request

    app.post("/deliveries", verifyToken, async (req, res) => {
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



    app.get("/deliveries/user/:email", verifyToken, async (req, res) => {
        try {

             console.log("JWT Email:", req.user.email);
  console.log("Param Email:", req.params.email);
          const email = req.params.email;

          if (
              req.user.email !== email
            ) {
              return res.status(403).send({
                message: "Forbidden",
              });
            }

          const result =  await deliveriesCollection.find({
                userEmail: email,
              }).sort({
                requestDate: -1,
              }).toArray();

          res.send(result);

        } catch (error) {
          res.status(500).send({
            message:
              error.message,
          });
        }
      }
    );


    app.get("/deliveries/librarian/:email", verifyToken, async (req, res) => {
        try {

          const email = req.params.email;

          const result = await deliveriesCollection
              .find({
                librarianEmail: email,
              })
              .sort({
                requestDate: -1,
              })
              .toArray();

          res.send(result);

        } catch (error) {

          res.status(500).send({
            message:
              error.message,
          });
        }
      }
    );


    app.patch("/deliveries/status/:id", verifyToken, async (req, res) => {
        try {
          const id = req.params.id;
          const { status } = req.body;

          const result = await deliveriesCollection.updateOne(
                {
                  _id:
                    new ObjectId(id),
                },
                {
                  $set: {
                    status,
                  },
                }
              );

          res.send(result);

        } catch (error) {
          res.status(500).send({
            message:
              error.message,
            });
        }
      }
    );



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


    app.post("/transactions", verifyToken, async (req, res) => {
        const transaction = req.body;

        const result = await transactionsCollection.insertOne(transaction);

        res.send(result);
      }
    );


   app.get("/transactions", verifyToken, verifyAdmin, async (req, res) => {
        try {
          const result = await transactionsCollection
              .find()
              .sort({
                date: -1,
              })
              .toArray();

          res.send(result);

        } catch (error) {
          res.status(500).send({
            message: error.message,
          });
        }
      }
    );


    // reviews related api

    app.post("/reviews", verifyToken, async (req, res) => {
      try {
        const review = req.body;

        const delivery = await deliveriesCollection.findOne({
          userEmail: review.userEmail,
          bookId: review.bookId,
          status: "Delivered",
        });

        if (!delivery) {
            return res.status(403).send({
              success: false,
              message: "You must receive the book before reviewing.",
            });
        }

        review.createdAt = new Date();
        const result = await reviewsCollection.insertOne(review);

        res.send({
          success: true,
          result,
        });

      } catch (error) {
            res.status(500).send({
              message: error.message,
            });
        }
      }
    );


    app.get("/reviews/can-review", verifyToken, async (req, res) => {  
        try {
          const { email, bookId,}= req.query;
      
          const delivery = await deliveriesCollection.findOne({
              userEmail: email,
              bookId,
              status:"Delivered",
            });
        
          res.send({canReview: !!delivery,});
      
        } catch (error) {
          res.status(500).send({
            message: error.message,
          });
        }
      }
    );




    app.get("/reviews/book/:bookId", async (req, res) => {
        try {
          const bookId = req.params.bookId;

          const result = await reviewsCollection.find({
                bookId
              })
              .sort({
                  createdAt: -1,
                })
              .toArray();

          res.send(result);

        } catch (error) {
          res.status(500).send({
            message: error.message,
          });
        }
      }
    );


    app.get("/reviews/user/:email", verifyToken, async (req, res) => {
        try {
          const email = req.params.email;

          const result = await reviewsCollection
              .find({
                userEmail: email,
              })
              .sort({
                createdAt: -1,
              })
              .toArray();

          res.send(result);

        } catch (error) {
          res.status(500).send({
            message:
              error.message,
          });
        }
      }
    );


    app.patch("/reviews/:id", verifyToken, async (req, res) => {
        try {
          const id = req.params.id;

          const { comment } = req.body;

          const result = await reviewsCollection.updateOne(
                {
                  _id: new ObjectId(id),
                },
                {
                  $set: {
                    comment,
                  },
                }
              );

          res.send(result);

        } catch (error) {
          res.status(500).send({
            message:
              error.message,
          });
        }
      }
    );


    app.delete("/reviews/:id", verifyToken, async (req, res) => {
        try {
          const id = req.params.id;

          const result = await reviewsCollection.deleteOne({_id: new ObjectId(id)});

          res.send(result);

        } catch (error) {
          res.status(500).send({
            message:
              error.message,
          });
        }
      }
    );


    // Reading list related api

    app.get("/reading-list/:email", verifyToken, async (req, res) => {
        try {
          const email = req.params.email;

          const result = await deliveriesCollection.find({
                userEmail: email,
                status: "Delivered",
              })
              .toArray();

          res.send(result);

        } catch (error) {
          res.status(500).send({
            message:
              error.message,
          });
        }
      }
    );




    // admin stats overview api

    app.get("/admin/stats", verifyToken, verifyAdmin, async (req, res) => {
      try {

        const totalUsers = await usersCollection.countDocuments();
        const totalBooks = await booksCollection.countDocuments();
        const totalDeliveries = await deliveriesCollection.countDocuments();
        const transactions = await transactionsCollection.find().toArray();

        const totalRevenue = transactions.reduce((sum, item) =>
              sum + Number(item.amount || 0),
            0
          );

        res.send({ totalUsers, totalBooks, totalDeliveries, totalRevenue,});

      } catch (error) {
        res.status(500).send({
          message: error.message,
        });
      }
    });


    app.get("/admin/books-by-category", verifyToken, verifyAdmin, async (req, res) => {
        try {
          const result = await booksCollection.aggregate([
                {
                  $group: {
                    _id: "$category",
                    value: {
                      $sum: 1,
                    },
                  },
                },
              ])
              .toArray();

          res.send(result);

        } catch (error) {
          res.status(500).send({
            message: error.message,
          });
        }
      }
    );


    // user stats overview api

    app.get("/dashboard/user-overview/:email", verifyToken, async (req, res) => {
        try {
          const email = req.params.email;

          const deliveries = await deliveriesCollection
              .find({
                userEmail: email,
              })
              .toArray();

          const totalBooksRead = deliveries.filter(
              item => item.status === "Delivered").length;

          const pendingDeliveries = deliveries.filter(
              item => item.status === "Pending" ||
                item.status === "Dispatched").length;

          const totalSpent = deliveries.reduce((sum, item)=>
                sum +
                (
                  Number(item.deliveryFee) || 0
                ),
              0
            );

          res.send({
            totalBooksRead,
            pendingDeliveries,
            totalSpent,
            chartData: deliveries,
          });

        } catch (error) {
          res.status(500).send({
            message: error.message,
          });
        }
      }
    );


    // librarian stats overview

    app.get("/dashboard/librarian-overview/:email", verifyToken, async (req, res) => {
        try {
          const email = req.params.email;

          const books = await booksCollection.find({
                librarianEmail: email,
              }).toArray();

          const deliveries = await deliveriesCollection.find({
                librarianEmail: email,
              }).toArray();

          const totalBooks = books.length;

          const totalEarnings = deliveries.filter(item => 
                item.status === "Delivered")
                .reduce((sum, item)=>
                  sum +
                  Number(item.deliveryFee),
                0
              );

          const pendingRequests = deliveries.filter(item =>
                item.status === "Pending").length;

          res.send({
            totalBooks,
            totalEarnings,
            pendingRequests,
            chartData: deliveries,
          });

        } catch (error) {
          res.status(500).send({
            message: error.message,
          });
        }
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

    // await client.db("admin").command({ ping: 1 });

    console.log("MongoDB Connected Successfully");
  } finally {
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});