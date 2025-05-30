const catchAsync = require("./../utils/catchAsync");
const AppError = require("./../utils/appError");
const APIFeatures = require("./../utils/apiFeatures");
const Product = require("./../models/productModel");
const Review = require("./../models/reviewModel");
const Order = require("./../models/orderModel");
const Import = require("./../models/importModel");
const User = require("./../models/userModel");
const Comment = require("./../models/commentModel");

function handleQuery(req, value) {
  const obj = {};
  if (req.query[value + "_lt"] != undefined) obj.lt = req.query[value + "_lt"];
  if (req.query[value + "_lte"] != undefined) obj.lte = req.query[value + "_lte"];
  if (req.query[value + "_gt"] != undefined) obj.gt = req.query[value + "_gt"];
  if (req.query[value + "_gte"] != undefined) obj.gte = req.query[value + "_gte"];
  if (JSON.stringify(obj) !== "{}") req.query[value] = obj;
}

exports.deleteOne = (Model) =>
  catchAsync(async (req, res, next) => {
    if (Model == Import) {
      const invoice = await Model.findById(req.params.id);
      await invoice.invoice.forEach(async (value) => {
        await Product.findByIdAndUpdate(value.product, {
          $inc: { inventory: -value.quantity },
        });
      });
    }
    const doc = await Model.findByIdAndDelete(req.params.id);
    if (!doc) {
      return next(new AppError("Không tìm thấy dữ liệu với ID này", 404));
    }
    if (Model == Comment) {
      await Model.deleteMany({ _id: { $in: doc.children } });
      if (doc.parent != null) {
        const parent = await Model.findById(doc.parent);
        const newChildren = parent.children.filter(
          (child) => child.id != doc.id
        );
        parent.children = newChildren;
        await parent.save({ validateBeforeSave: false });
      }
    }
    if (Model == Review) {
      Model.calcAverageRatings(doc.product);
    }
    res.status(204).json({
      status: "success",
      data: null,
    });
  });

exports.updateOne = (Model) =>
  catchAsync(async (req, res, next) => {
    if (Model == Product) {
      req.body.updatedBy = req.user.id;
      req.body.updatedAt = Date.now() - 1000;
      req.body.description = req.body.description
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
      const doc = await Model.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: false,
      });
      if (!doc) {
        return next(new AppError("Không tìm thấy dữ liệu với ID này", 404));
      }
      return res.status(200).json({
        status: "success",
        data: { data: doc },
      });
    }

    if (Model == Review || Model == Comment) {
      req.body.updateAt = Date.now() - 1000;
    }

    if (Model == Import) {
      const invoice = await Model.findById(req.params.id);
      await invoice.invoice.forEach(async (value) => {
        await Product.findByIdAndUpdate(value.product, {
          $inc: { inventory: -value.quantity },
        });
      });
      const product = req.body.invoice;
      for (const value of product) {
        await Product.findByIdAndUpdate(value.product, {
          $inc: { inventory: value.quantity },
        });
      }
    }

    const doc = await Model.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!doc) {
      return next(new AppError("Không tìm thấy dữ liệu với ID này", 404));
    }
    if (Model == Review) {
      Model.calcAverageRatings(doc.product);
    }

    res.status(200).json({
      status: "success",
      data: {
        data: doc,
      },
    });
  });

exports.createOne = (Model) =>
  catchAsync(async (req, res, next) => {
    if (Model == Product) {
      req.body.createdBy = req.user.id;
    }
    if (Model == Order) {
      const cart = req.body.cart;
      for (const value of cart) {
        const name =
          value.product.title.length > 39
            ? value.product.title.slice(0, 40)
            : value.product.title;
        const invent = await Product.findById(value.id);
        if (value.quantity > invent.inventory) {
          return next(
            new AppError(`Số lượng hàng ${name} trong kho không đủ`, 500)
          );
        }
      }

      const doc = await Model.create(req.body);
      for (const value of cart) {
        await Product.findByIdAndUpdate(value.id, {
          $inc: { inventory: -value.quantity },
        });
      }

      return res.status(201).json({
        status: "success",
        data: {
          id: doc.id,
          totalPrice: doc.totalPrice,
        },
      });
    }

    if (Model == Import) {
      const invoice = req.body.invoice;
      for (const value of invoice) {
        await Product.findByIdAndUpdate(value.product, {
          $inc: { inventory: value.quantity },
        });
      }
    }

    const doc = await Model.create(req.body);
    if (Model === Comment) {
      const data = await Comment.findById(req.body.parent);
      if (data) {
        data.children.push(doc.id);
        await data.save({ validateBeforeSave: false });
      }
    }
    res.status(201).json({
      status: "success",
      data: {
        data: doc,
      },
    });
  });

exports.getOne = (Model, popOptions) =>
  catchAsync(async (req, res, next) => {
    let query = Model.findById(req.params.id);
    if (popOptions) query = query.populate(popOptions);
    const doc = await query;

    if (!doc) {
      return next(new AppError("Không tìm thấy dữ liệu với ID này", 404));
    }

    res.status(200).json({
      status: "success",
      data: {
        data: doc,
      },
    });
  });

exports.getAll = (Model) =>
  catchAsync(async (req, res, next) => {
    handleQuery(req, "price");
    handleQuery(req, "promotion");

    let filter = {};
    if (req.params.productId) filter = { product: req.params.productId };
    if (Model == Comment) filter.parent = null;

    const features = new APIFeatures(Model.find(filter), req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const doc = await features.query;
    let totalPage = 1;

    if (Model == Review && req.params.productId) {
      const more = await Product.findById(req.params.productId).populate({
        path: "reviews",
      });
      const totalFilter = more.reviews.length;
      if (req.query.page != undefined) {
        totalPage = Math.ceil(totalFilter / Number(req.query.limit));
      }
      if (req.query.page > totalPage)
        return res.status(200).json({
          status: "success",
          data: {
            data: doc,
            results: doc.length,
            ratingsQuantity: more.ratingsQuantity,
            ratingsAverage: more.ratingsAverage,
            eachRating: more.eachRating,
            totalPage: 1,
          },
        });
      return res.status(200).json({
        status: "success",
        data: {
          data: doc,
          results: doc.length,
          ratingsQuantity: more.ratingsQuantity,
          ratingsAverage: more.ratingsAverage,
          eachRating: more.eachRating,
          totalPage,
        },
      });
    }

    if (req.query.page != undefined) {
      const filterModel = new APIFeatures(Model.find(filter), req.query)
        .filter()
        .sort()
        .limitFields();
      const filterData = await filterModel.query;

      totalPage = Math.ceil(filterData.length / Number(req.query.limit));
      if (req.query.page > totalPage)
        return res.status(200).json({
          status: "success",
          data: {
            data: doc,
            results: doc.length,
            totalPage: 1,
          },
        });
    }

    res.status(200).json({
      status: "success",
      results: doc.length,
      data: {
        data: doc,
        totalPage,
        currentPage: req.query.page,
      },
    });
  });

exports.getTable = (Model) =>
  catchAsync(async (req, res, next) => {
    let filter = {};
    let searchStr = req.query.search["value"];
    if (searchStr) {
      filter["$text"] = { $search: searchStr };
    }

    Model.count({}, function (err, c) {
      const recordsTotal = c;
      Model.count(filter, function (err, c) {
        const recordsFiltered = c;
        Model.find(
          filter,
          {},
          {
            sort: { _id: -1 },
            skip: Number(req.query.start),
            limit: Number(req.query.length),
          },
          function (err, results) {
            if (err) {
              return;
            }
            const data = {
              draw: req.query.draw,
              recordsFiltered,
              recordsTotal,
              data: results,
            };
            res.status(200).json(data);
          }
        );
      });
    });
  });

exports.checkPermission = (Model) =>
  catchAsync(async (req, res, next) => {
    const doc = await Model.findById(req.params.id);
    if (req.user.id != doc.user._id && req.user.role == "user") {
      return next(new AppError("Bạn không có quyền để thực hiện", 403));
    }
    if (Model == Order) {
      req.order = doc;
    }
    next();
  });
