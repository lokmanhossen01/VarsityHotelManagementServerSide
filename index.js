const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SEC_KEY);

const port = process.env.PORT || 3000;

// Middleware ==============
const options = {
  origin: [
    'http://localhost:5173',
    'https://fueled-student.web.app',
    'https://fueled-student.firebaseapp.com',
  ],
  credentials: true,
  optionsSuccessStatus: 200,
};
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
};

app.use(cors(options));
app.use(express.json());
app.use(cookieParser());

// Veryfy token
const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token;
  // console.log('verifyTokennn:', token);
  if (!token) {
    return res.status(401).send({ message: 'Unauthorized' });
  }
  jwt.verify(token, process.env.TOKEN_SEC, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'Unauthorized' });
    }
    req.user = decoded;
    next();
  });
};

// MongoDB URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.htex290.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    // All DB Cullection
    const mealsCollection = client.db('fueled_student_DB').collection('meals');
    // Create an index on the 'title' field
    // await mealsCollection.createIndex({ title: 1 });
    // console.log('Index created on title field');

    const userCollection = client.db('fueled_student_DB').collection('users');
    // await userCollection.createIndex({ userEmail: 1, userName: 1 });

    const likeCollection = client.db('fueled_student_DB').collection('likes');

    const paymentCollection = client
      .db('fueled_student_DB')
      .collection('payments');
    const upcomingCollection = client
      .db('fueled_student_DB')
      .collection('upcoming_meals');
    // Create an index on the 'title' field
    // await mealsCollection.createIndex({ title: 1 });

    const mealsRequestCollection = client
      .db('fueled_student_DB')
      .collection('meals-request');
    // await mealsRequestCollection.createIndex({ recEmail: 1, recName: 1 });

    const reviewCollection = client
      .db('fueled_student_DB')
      .collection('reviews');

    // Auth related API
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.TOKEN_SEC, {
        expiresIn: '1d',
      });
      // console.log('token:', token);
      res.cookie('token', token, cookieOptions).send({ success: true });
    });

    // Cookies remove
    app.post('/logout', verifyToken, async (req, res) => {
      const user = req.body;
      console.log('Remove token');
      return res.clearCookie('token', { maxAge: 0 }).send({ success: true });
    });

    // Services related API

    // User part============

    // New user post-
    app.post('/new-user', async (req, res) => {
      const user = req.body;
      // console.log(user);
      // return;
      const query = { userEmail: user.userEmail };
      const existUser = await userCollection.findOne(query);
      if (existUser) {
        return res.send({ message: 'User Allready Exists', insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });
    // All user read
    app.get('/total-users', verifyToken, async (req, res) => {
      const result = await userCollection.estimatedDocumentCount();
      res.send({ count: result });
    });
    app.get('/users', verifyToken, async (req, res) => {
      const search = req.query.search;
      const filter = req.query.filter;
      const perpage = parseInt(req.query.perpage);
      const currentpage = parseInt(req.query.currentpage);
      const skip = perpage * currentpage;

      let result;
      let doc;
      if (
        filter === 'Silver' ||
        filter === 'Gold' ||
        filter === 'Platinum' ||
        filter === 'Bronze'
      ) {
        doc = {
          badge: filter,
        };
      }

      if (search) {
        const query = {
          $or: [
            { userName: { $regex: search, $options: 'i' } },
            { userEmail: { $regex: search, $options: 'i' } },
          ],
        };
        result = await userCollection.find(query).toArray();
      } else if (doc) {
        result = await userCollection.find(doc).toArray();
      } else {
        result = await userCollection
          .find()
          .limit(perpage)
          .skip(skip)
          .toArray();
      }
      res.send(result);
    });

    // Check Admin
    app.get('/user/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      // console.log(email);
      if (email !== req.user.email) {
        return req.status(403).send({ message: 'Unauthorized access' });
      }
      // console.log('emailll', req.user.email);
      const query = { userEmail: email, role: 'admin' };
      const result = await userCollection.findOne(query);
      let admin = false;
      if (result?.role === 'admin') {
        admin = true;
      }
      // console.log(admin);

      res.send({ admin });
    });

    // User badge change --
    app.patch('/change-user-badge', verifyToken, async (req, res) => {
      const badge = req.query.badge;
      const email = req.query.email;
      // console.log('empolye:', role, '===id:', id);
      const query = { email: email };
      const update = {
        $set: {
          role: badge,
        },
      };
      const options = { upsert: true };
      const result = await userCollection.updateOne(query, update, options);
      res.send(result);
    });
    // User role change --
    app.patch('/change-user-role', verifyToken, async (req, res) => {
      const role = req.query.role;
      const id = req.query.id;
      // console.log('empolye:', role, '===id:', id);
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: {
          role: role,
        },
      };
      const result = await userCollection.updateOne(query, update);
      res.send(result);
    });

    // Payment part token passing =======
    app.post('/create-payment-intent', verifyToken, async (req, res) => {
      const { price } = req.body;
      const pricee = parseInt(price * 100);
      // console.log(pricee);
      // return;
      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: pricee,
        currency: 'usd',
        payment_method_types: ['card'],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    //  Payment Saved
    app.post('/payments', verifyToken, async (req, res) => {
      const data = req.body;
      // const query = { email: data.email, badge: badge };
      const query2 = { userEmail: data.email };
      const badge = data.badge;
      const update = {
        $set: {
          badge: badge,
        },
      };
      const options = { upsert: true };
      const user_update = await userCollection.updateOne(
        query2,
        update,
        options
      );

      // const existUser = await paymentCollection.findOne(query);
      // if (existUser) {
      //   return res.send({ message: 'User Allready Exists', insertedId: null });
      // }
      const result = await paymentCollection.insertOne(data);

      res.send({ result, user_update });
    });
    //  Payment History read
    app.get('/all-payments', verifyToken, async (req, res) => {
      const result = await paymentCollection.find().sort({ _id: -1 }).toArray();
      res.send(result);
    });
    app.get('/paymentss/:email', verifyToken, async (req, res) => {
      const query = { email: req.params.email };
      const result = await paymentCollection
        .find(query)
        .sort({ _id: -1 })
        .toArray();
      res.send(result);
    });
    app.get('/paymentssCnf/:email', async (req, res) => {
      const query = { email: req.params.email };
      const result = await paymentCollection.findOne(query);
      let final = false;
      if (result) {
        final = true;
      }
      res.send(final);
    });

    // Main part=======================
    app.post('/upcomig-meal', verifyToken, async (req, res) => {
      const meal = req.body;
      // console.log(newItem);
      const result = await upcomingCollection.insertOne(meal);
      res.send(result);
    });
    app.get('/upcoming-meals', async (req, res) => {
      const filter = req.query.filter;
      const search = req.query.search;

      let doc;
      // Filtering logic =======
      if (filter === 'dinner' || filter === 'breakfast' || filter === 'lunch') {
        doc = {
          mealType: filter,
        };
      } else if (
        filter === '15,20' ||
        filter === '10,15' ||
        filter === '5,10' ||
        filter === '0,5'
      ) {
        const filArr = filter.split(',');
        const filter1 = parseInt(filArr[0]);
        const filter2 = parseInt(filArr[1]);
        doc = {
          price: {
            $gte: filter1,
            $lte: filter2,
          },
        };
      } else if (filter === '20') {
        const filterAb = parseInt(filter);
        // console.log(filterAb, '++++++++');
        doc = {
          price: {
            $gte: filterAb,
          },
        };
      }

      let result;
      if (search) {
        const query = {
          title: { $regex: search, $options: 'i' },
        };
        result = await upcomingCollection
          .find(query)
          .sort({ likes: -1 })
          .toArray();
      } else if (doc) {
        result = await upcomingCollection
          .find(doc)
          .sort({ likes: -1 })
          .toArray();
      } else {
        result = await upcomingCollection.find().sort({ likes: -1 }).toArray();
      }
      res.send(result);
    });
    app.put('/upcoming-meal-update/:id', verifyToken, async (req, res) => {
      const meal = req.body;
      const filter = { _id: new ObjectId(req.params.id) };
      // console.log(review);
      const doc = {
        $set: {
          ...meal,
        },
      };
      const result = await upcomingCollection.updateOne(filter, doc);
      res.send(result);
    });
    // Meal delete Upcoming
    app.delete('/delete-upcoming-meal/:id', verifyToken, async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const result = await upcomingCollection.deleteOne(query);
      res.send(result);
    });
    app.post('/post-meal', verifyToken, async (req, res) => {
      const meal = req.body;
      // console.log(newItem);
      const result = await mealsCollection.insertOne(meal);
      res.send(result);
    });
    // All user read
    app.get('/total-meals', async (req, res) => {
      const result = await mealsCollection.estimatedDocumentCount();
      res.send({ count: result });
    });
    // Author Md Ataullah
    app.get('/meals', async (req, res) => {
      const filter = req.query.filter;
      const search = req.query.search;
      const page = parseInt(req.query.page) || 1; // Default to page 1 if not provided
      const pageSize = 4;
      const skip = (page - 1) * pageSize;

      let doc;
      // Filtering logic =======
      if (filter === 'dinner' || filter === 'breakfast' || filter === 'lunch') {
        doc = {
          mealType: filter,
        };
      } else if (
        filter === '15,20' ||
        filter === '10,15' ||
        filter === '5,10' ||
        filter === '0,5'
      ) {
        const filArr = filter.split(',');
        const filter1 = parseInt(filArr[0]);
        const filter2 = parseInt(filArr[1]);
        doc = {
          price: {
            $gte: filter1,
            $lte: filter2,
          },
        };
      } else if (filter === '20') {
        const filterAb = parseInt(filter);
        // console.log(filterAb, '++++++++');
        doc = {
          price: {
            $gte: filterAb,
          },
        };
      }

      let result;
      if (search) {
        const sampleDocument = await mealsCollection.findOne();
        const fields = Object.keys(sampleDocument);

        const query = {
          $or: fields.map((field) => ({
            [field]: { $regex: search, $options: 'i' },
          })),
        };

        result = await mealsCollection
          .find(query)
          .sort({ _id: -1 })
          .skip(skip)
          .limit(pageSize)
          .toArray();
      } else if (doc) {
        // console.log(doc);
        result = await mealsCollection
          .find(doc)
          .sort({ _id: -1 })
          .skip(skip)
          .limit(pageSize)
          .toArray();
      } else {
        result = await mealsCollection
          .find()
          .sort({ _id: -1 })
          .skip(skip)
          .limit(pageSize)
          .toArray();
      }
      res.send(result);
    });
    // detabase all mealsa
    app.get('/all-meals', verifyToken, async (req, res) => {
      const search = req.query.search;
      const filter = req.query.filter;
      const perpage = parseInt(req.query.perpage);
      const currentpage = parseInt(req.query.currentpage);
      const skip = perpage * currentpage;

      // console.log(filter);
      let result;
      if (search) {
        const sampleDocument = await mealsCollection.findOne();
        const fields = Object.keys(sampleDocument);

        const query = {
          $or: fields.map((field) => ({
            [field]: { $regex: search, $options: 'i' },
          })),
        };
        result = await mealsCollection.find(query).sort({ _id: -1 }).toArray();
      } else if (filter === 'like') {
        result = await mealsCollection
          .find()
          .sort({ likes: -1 })
          .limit(perpage)
          .skip(skip)
          .toArray();
      } else if (filter === 'review') {
        result = await mealsCollection
          .find()
          .sort({ review: -1 })
          .limit(perpage)
          .skip(skip)
          .toArray();
      } else {
        result = await mealsCollection
          .find()
          .limit(perpage)
          .skip(skip)
          .toArray();
      }
      res.send(result);
    });
    // update meal
    app.put('/meal-update/:id', verifyToken, async (req, res) => {
      const meal = req.body;
      const filter = { _id: new ObjectId(req.params.id) };
      // console.log(review);
      const doc = {
        $set: {
          ...meal,
        },
      };
      const result = await mealsCollection.updateOne(filter, doc);
      res.send(result);
    });
    // Meal delete
    app.delete('/delete-meal/:id', verifyToken, async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const result = await mealsCollection.deleteOne(query);
      res.send(result);
    });
    // Meals total length
    app.get('/meals-len', async (req, res) => {
      const result = await mealsCollection.estimatedDocumentCount();
      const finalRes = result;
      // console.log(finalRes);
      res.send({ finalRes });
    });

    app.get('/meals-six', async (req, res) => {
      const result = await mealsCollection
        .find()
        .sort({ _id: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });
    app.get('/breakfast', async (req, res) => {
      const query = { mealType: 'breakfast' };
      const result = await mealsCollection
        .find(query)
        .sort({ _id: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });
    app.get('/lunch', async (req, res) => {
      const query = { mealType: 'lunch' };
      const result = await mealsCollection
        .find(query)
        .sort({ _id: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });
    app.get('/dinner', async (req, res) => {
      const query = { mealType: 'dinner' };
      const result = await mealsCollection
        .find(query)
        .sort({ _id: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });
    app.get('/details/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await mealsCollection.findOne(query);
      // console.log(result);
      res.send(result);
    });
    // user Meals post like counting
    app.put('/like-count', verifyToken, async (req, res) => {
      const data = req.body;
      // console.log(data);
      const postId = data.id;
      const count = data.count;
      const query = { _id: new ObjectId(postId) };
      // console.log('count value:', count, 'id:', postId);
      const doc = { $inc: { likes: count } };
      const result = await mealsCollection.updateOne(query, doc);

      const countLike = data.liked;
      const email = data.email;
      const filter = { email: email, postId: postId };
      const options = { upsert: true };
      const updateDoc = {
        $set: { countLike, email, postId },
      };
      const colorResult = await likeCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      // if (colorResult.upsertedCount > 0) {
      //   console.log(
      //     `A new document was inserted with the _id: ${colorResult.upsertedId}`
      //   );
      // } else if (colorResult.modifiedCount > 0) {
      //   console.log(`An existing document was updated`);
      // } else {
      //   console.log(`No document was modified or inserted`);
      // }
      res.send({ result, colorResult });
    });
    // user Meals post like counting
    app.put('/like-count-upcoming', verifyToken, async (req, res) => {
      const data = req.body;
      // console.log(data);
      const postId = data.id;
      const count = data.count;
      const query = { _id: new ObjectId(postId) };
      // console.log('count value:', count, 'id:', postId);
      const doc = { $inc: { likes: count } };
      const result = await upcomingCollection.updateOne(query, doc);

      const countLike = data.liked;
      const email = data.email;
      const filter = { email: email, postId: postId };
      const options = { upsert: true };
      const updateDoc = {
        $set: { countLike, email, postId },
      };
      const colorResult = await likeCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send({ result, colorResult });
    });
    // Like select or not select
    app.get('/liked-count', async (req, res) => {
      const id = req.query.id;
      const email = req.query.email;
      const query = { postId: id, email: email };
      const result = await likeCollection.findOne(query);
      let likedd = false;
      if (result?.countLike === 1) {
        likedd = true;
      } else {
        likedd = false;
      }
      res.send(likedd);
    });
    // add review post
    app.post('/post-review', verifyToken, async (req, res) => {
      const review = req.body;
      console.log(review);
      const result = await reviewCollection.insertOne(review);
      res.send(result);
    });
    // reviews read
    app.get('/reviews', async (req, res) => {
      const result = await reviewCollection.find().sort({ _id: -1 }).toArray();
      res.send(result);
    });

    // Update review post
    app.put('/review-update/:id', verifyToken, async (req, res) => {
      const review = req.body;
      const filter = { _id: new ObjectId(req.params.id) };
      // console.log(review);
      const doc = {
        $set: {
          ...review,
        },
      };
      const result = await reviewCollection.updateOne(filter, doc);
      res.send(result);
    });
    // review read by my post
    app.get('/read-my-review/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { reviewUserEmail: email };
      const myReviewArr = await reviewCollection
        .find(query)
        .sort({ _id: -1 })
        .toArray();
      res.send(myReviewArr);
    });
    // review post read
    app.get('/read-review/:id', async (req, res) => {
      const query = { postId: req.params.id };
      const result = await reviewCollection
        .find(query)
        .sort({ _id: -1 })
        .toArray();
      res.send(result);
    });
    // My review delete
    app.delete('/delete-review/:id', verifyToken, async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const result = await reviewCollection.deleteOne(query);
      res.send(result);
    });
    // Sum of all rating
    app.get('/sum-of-rating/:id', async (req, res) => {
      try {
        const doc = [
          { $match: { postId: req.params.id } },
          {
            $group: {
              _id: null,
              totalRating: { $sum: '$rating' },
              totalCount: { $sum: 1 },
            },
          },
        ];
        const result = await reviewCollection.aggregate(doc).toArray();
        if (result.length > 0) {
          const totalRating = result[0].totalRating;
          const totalCount = result[0].totalCount;
          const averageRating = totalCount > 0 ? totalRating / totalCount : 0;
          res.json({
            totalRating: totalRating,
            totalCount: totalCount,
            averageRating: averageRating,
          });
        }
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Meals Request
    app.post('/meals-request', verifyToken, async (req, res) => {
      const request = req.body;
      // console.log(request);
      const query = {
        recEmail: request.recEmail,
        recMealId: request.recMealId,
      };
      const existRec = await mealsRequestCollection.findOne(query);
      if (existRec) {
        return res.send({
          message: 'Request Allready Exists',
          insertedId: null,
        });
      }
      const result = await mealsRequestCollection.insertOne(request);
      res.send(result);
    });

    app.get('/request-meals/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      try {
        const query = { recEmail: email };
        const requestsArray = await mealsRequestCollection
          .find(query)
          .sort({ _id: -1 })
          .toArray();

        // Ensure that we have requests
        if (requestsArray.length === 0) {
          return res.send([]);
        }

        // Extract recMealIds from requests and convert them to ObjectId
        const recMealIds = requestsArray.map(
          (request) => new ObjectId(request.recMealId)
        );

        // Query the meals collection with the array of recMealIds
        const queryMeal = { _id: { $in: recMealIds } };
        const mealsArray = await mealsCollection.find(queryMeal).toArray();

        // Create a lookup object from mealsArray
        const mealsLookup = mealsArray.reduce((acc, meal) => {
          acc[meal._id.toString()] = meal;
          return acc;
        }, {});

        // Merge the arrays and adjust the structure as required
        const finalResult = requestsArray.map((request) => {
          const meal = mealsLookup[request.recMealId];
          if (meal) {
            // Combine the request and meal objects, remove original _id
            const { _id, ...mealData } = meal;
            return {
              ...request,
              ...mealData,
              _id: request._id, // retain the original request _id
            };
          }
          return request;
        });

        // console.log(finalResult);
        res.send(finalResult);
      } catch (error) {
        console.error('Error fetching meal data:', error);
        res.status(500).send({ error: 'Internal Server Error' });
      }
    });

    app.delete('/cancel-req/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { _id: new ObjectId(id) };
      const result = await mealsRequestCollection.deleteOne(query);
      res.send(result);
    });

    app.get('/total-request', verifyToken, async (req, res) => {
      const result = await mealsRequestCollection.estimatedDocumentCount();
      res.send({ count: result });
    });

    app.get('/request', async (req, res) => {
      const search = req.query.search;
      const filter = req.query.filter;
      const perpage = parseInt(req.query.perpage);
      const currentpage = parseInt(req.query.currentpage);
      const skip = perpage * currentpage;

      let doc;
      if (
        filter === 'pending' ||
        filter === 'processing' ||
        filter === 'served'
      ) {
        doc = {
          status: filter,
        };
      }

      let result;
      if (search) {
        const query = {
          $or: [
            { recEmail: { $regex: search, $options: 'i' } },
            { recName: { $regex: search, $options: 'i' } },
          ],
        };
        result = await mealsRequestCollection.find(query).toArray();
      } else if (doc) {
        result = await mealsRequestCollection
          .find(doc)
          .sort({ _id: -1 })
          .toArray();
      } else {
        result = await mealsRequestCollection
          .find()
          .limit(perpage)
          .skip(skip)
          .sort({ _id: -1 })
          .toArray();
      }
      res.send(result);
    });
    app.patch('/request-meals-status-update', verifyToken, async (req, res) => {
      const id = req.query.id;
      const status = req.query.status;
      // console.log('id:', id, '  status: ', statusDta);
      const query = { _id: new ObjectId(id) };
      const docUpdate = {
        $set: {
          status: status,
        },
      };
      const result = mealsRequestCollection.updateOne(query, docUpdate);
      res.send(result);
    });

    app.delete('/request-delete/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      // console.log(id);
      const query = { _id: new ObjectId(id) };
      const result = await mealsRequestCollection.deleteOne(query);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    // await client.db('admin').command({ ping: 1 });
    // console.log('PYou successfully connected to MongoDB!');
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
