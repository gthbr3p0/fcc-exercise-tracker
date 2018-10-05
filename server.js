const express = require('express')
const app = express()
const bodyParser = require('body-parser')

const cors = require('cors')

const mongoose = require('mongoose')
mongoose.connect(process.env.MLAB_URI)

const userSchema = new mongoose.Schema({
  username: {type: String, required: true, maxlength: 20, unique: true}
});
const User = mongoose.model('GymUsers', userSchema);

const logSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  description: { type: String, required: true },
  duration: { type: Number, required: true },
  date: { type: Date, default: Date.now }
});
const Log = mongoose.model('GymLog', logSchema);

app.use(cors())

app.use(bodyParser.urlencoded({extended: false}))
app.use(bodyParser.json())


app.use(express.static('public'))
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html')
});


app.post("/api/exercise/new-user", function(req, res, next) {
  
  const newUser = new User({username: req.body.username});
  
  newUser.save(function(error, data) {
  
    if (error) {
    
      if(error.errors &&
         error.errors.username &&
         error.errors.username['$isValidatorError'] &&
         error.errors.username.kind == 'maxlength') {
        return next({
          status: 400,
          message: 'username too long'
        });
        
      }
        
      if (error.code == 11000) return next({
        status: 400,
        message: 'username already taken'
      });
        
      return next(error);
    }
    
    res.json({
      username: data.username,
      _id: data._id
    });
  });
});

app.post("/api/exercise/add", function(req, res, next) {

  User.findById(req.body.userId,
                'username',
                {lean: true},
                function(error, user) {
  
    if (error) {
      
      if (error.name == 'CastError' &&
          error.kind == 'ObjectId' &&
          error.path == '_id') {
        return next({
          status: 400,
          message: 'unknown _id'
        });
      }
      
      console.log('Error finding user _id:\n', error);
      return next(error);
    }
    
    if (!user) return next({
      status: 400,
      message: 'unknown _id'
    });
    
    const entry = {
      userId: req.body.userId,
      description: req.body.description,
      duration: req.body.duration
    };
    
    if (req.body.date) entry.date = req.body.date;
    const exercise = new Log(entry);
    
    exercise.save(function(error, exercise) {
    
      if (error) return next(error);
      
      res.json({
        username: user.username,
        _id: user._id,
        description: exercise.description,
        duration: exercise.duration,
        date: exercise.date.toDateString()
      });
    });
  });
});

app.get('/api/exercise/log', function(req, res, next) {

  if (!req.query.userId) return next({
    status: 400,
    message: 'unknown userId'
  });
  
  User.findById(req.query.userId,
                'username',
                {lean: true},
                function(error, user) {
  
    if(error) {
    
      if(error.name == 'CastError' &&
         error.kind == 'ObjectId' &&
         error.path == '_id') {
        return next({
          status: 400,
          message: 'unknown userId2'
        });
      }
      
      console.log('Error finding user _id:\n', error);
      return next(error);
    }
    
    if (!user) return next({
      status: 400,
      message: 'unknown userId'
    });
    
    const msg = {
      _id: user._id,
      username: user.username
    };
    
    const filter = {userId: req.query.userId};
    
    if (req.query.from) {
      const from = new Date(req.query.from);
      if (!isNaN(from.valueOf())) {
        filter.date = {'$gt': from};
        msg.from = from.toDateString();
      }
    }
    
    if (req.query.to) {
      const to = new Date(req.query.to);
      if (!isNaN(to.valueOf())) {
        if (!filter.date) filter.date = {};
        filter.date['$lt'] = to;
        msg.to = to.toDateString();
      }
    }
    
    const fields = 'description duration date';
    const options = {sort: {date: -1}};
    const query = Log.find(filter, fields, options).lean();
    
    if (req.query.limit) {
      const limit = parseInt(req.query.limit);
      if (limit) query.limit(limit);
    }
    
    query.exec(function(error, posts) {
    
      if (error) return next(error);
      
      for (let post of posts) {
        delete post._id;
        post.date = post.date.toDateString();
      }
      
      msg.count = posts.length;
      msg.log = posts;
      res.json(msg);
    });
  });
});

// Not found middleware
app.use((req, res, next) => {
  return next({status: 404, message: 'not found'})
})

// Error Handling middleware
app.use((err, req, res, next) => {
  let errCode, errMessage

  if (err.errors) {
    // mongoose validation error
    errCode = 400 // bad request
    const keys = Object.keys(err.errors)
    // report the first validation error
    errMessage = err.errors[keys[0]].message
  } else {
    // generic or custom error
    errCode = err.status || 500
    errMessage = err.message || 'Internal Server Error'
  }
  res.status(errCode).type('txt')
    .send(errMessage)
})

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port)
})
