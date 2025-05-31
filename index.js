const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const app = express();
const port = process.env.PORT || 3000;
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
// middleware
app.use(cors());
app.use(express.json());

// create http server for socket.io to bind on
const server = http.createServer(app);

// initialize socket.io server with CORS config
const io = new Server(server, {
  cors: {
    origin: "*", // allow all origins for development, change in production
    methods: ["GET", "POST"],
  },
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.pw0rah1.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
    await client.connect();

    const jobsCollection = client.db("career_linker").collection("jobs");
    const applicationsCollection = client
      .db("career_application")
      .collection("applications");

    // jobs api
    app.get("/jobs", async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.hr_email = email;
      }
      const cursor = jobsCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });
    //nicher ei system e korte pari kintu kora ucit na. eta recruiter email ar applicant 2 ta ke email er dara alada kortece....... eta upore kortece
    // app.get("jobsByEmailAddress", async (req, res) => {
    //   const email = req.query.email;
    //   const query = { hr_email: email };
    //   const result = await jobsCollection.find(query).toArray();
    //   res.send(result);
    // });

    // kono ekta nirdishto data pabar jonno
    app.get("/jobs/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await jobsCollection.findOne(query);
      res.send(result);
    });
    // client theke data patale recieve korar jonno
    app.post("/jobs", async (req, res) => {
      const newJob = req.body;
      const result = await jobsCollection.insertOne(newJob);
      res.send(result);
    });

    // job applications related APIs
    // app.get("/applications", async (req, res) => {
    //   const email = req.query.email;
    //   const query = {
    //     applicantEmail: email,
    //   };
    //   const result = await applicationsCollection.find(query).toArray();

      // bad way to aggregate data
    //   for (const application of result) {
    //     const jobId = application.jobId;
    //     const jobQuery = { _id: new ObjectId(jobId) };
    //     const job = await jobsCollection.findOne(jobQuery);
    //     application.company = job.company;
    //     application.title = job.title;
    //     application.company_logo = job.company_logo;
    //     application.applicantEmail = job.applicantEmail;
    //     application.submittedAt = job.submittedAt;
    //     application.submittedAt = job.submittedAt;
    //     application.referralSource = job.referralSource;
    //   }

    //   res.send(result);
    // });

    // another way start here
    app.get("/applications", async (req, res) => {
      const email = req.query.email;
      const query = { applicantEmail: email };

      const applications = await applicationsCollection.find(query).toArray();

      const updatedApplications = await Promise.all(
        applications.map(async (application) => {
          const job = await jobsCollection.findOne({
            _id: new ObjectId(application.jobId),
          });

          if (job) {
            return {
              ...application,
              company: job.company,
              title: job.title,
              company_logo: job.company_logo,
              referralSource: job.referralSource,
            };
          }

          return application;
        })
      );

      res.send(updatedApplications);
    });
    // another way end here

     app.post('/applications', async (req, res) => {
      const application = req.body;
      // console.log(application);
      const result = await applicationsCollection.insertOne(application);
      res.send(result);
    });


    // app.get('/applications/:id', () =>{})
    app.get('/applications/job/:job_id', async (req, res) => {
      const job_id = req.params.job_id;
      // console.log(job_id);
      const query = { jobId: job_id }
      const result = await applicationsCollection.find(query).toArray();
      res.send(result);
    })

    app.patch("/applications/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          status: req.body.status,
        },
      };

      const result = await applicationsCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.delete("/applications/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await applicationsCollection.deleteOne(query);
      res.send(result);
    });

    // Socket.IO connection and chat message handling start
    io.on("connection", (socket) => {
      console.log("New client connected:", socket.id);

      // Listen for chat messages from clients
      socket.on("chat message", (msg) => {
        console.log("Message received:", msg);

        // Broadcast the message to all other clients except sender
        socket.broadcast.emit("chat message", msg);
      });

      socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
      });
    });
    // Socket.IO connection and chat message handling end here

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Career server is running:");
});

app.listen(port, (req, res) => {
  console.log(`Career is running on port: ${port}`);
});
