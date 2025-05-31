const express = require("express");
const cors = require("cors");
var jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

const app = express();
const port = process.env.PORT || 3000;
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
// middleware
app.use(cors());
app.use(express.json());
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);
app.use(cookieParser());
var admin = require("firebase-admin");

var serviceAccount = require("./firebase-admin-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const logger = (req, res, next) => {
  console.log("inside the logger middleware");
  next();
};

const verifyToken = (req, res, next) => {
  const token = req?.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  jwt.verify(token, process.env.JWT_ACCESS_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers?.authorization;
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  const userInfo = await admin.auth().verifyIdToken(token);
  req.tokenEmail = userInfo.email;
  next();
};

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

    // jwt token related APIs
    app.post("/jwt", async (req, res) => {
      const userInfo = req.body;

      const token = jwt.sign(userInfo, process.env.JWT_ACCESS_SECRET, {
        expiresIn: "2h",
      });

      res.cookie("token", token, {
        httpOnly: true,
        secure: false,
      });

      res.send({ success: true });
    });

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
    app.get("/jobs/applications", verifyToken, async (req, res) => {
      const email = req.query.email;
      const query = { hr_email: email };
      const jobs = await jobsCollection.find(query).toArray();

      // should use aggregate to have optimum data fetching
      for (const job of jobs) {
        const applicationQuery = { jobId: job._id.toString() };
        const application_count = await applicationsCollection.countDocuments(
          applicationQuery
        );
        job.application_count = application_count;
      }
      res.send(jobs);
    });

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
    // job applications related APIs
    app.get("/applications", logger, verifyFirebaseToken, async (req, res) => {
      const email = req.query.email;
      if (req.tokenEmail != email) {
        return res.status(403).send({ message: "forbidden access" });
      }
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

    app.post("/applications", async (req, res) => {
      const application = req.body;
      // console.log(application);
      const result = await applicationsCollection.insertOne(application);
      res.send(result);
    });

    // app.get('/applications/:id', () =>{})
    app.get("/applications/job/:job_id", async (req, res) => {
      const job_id = req.params.job_id;
      // console.log(job_id);
      const query = { jobId: job_id };
      const result = await applicationsCollection.find(query).toArray();
      res.send(result);
    });

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
