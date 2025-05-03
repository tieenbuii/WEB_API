const loadData = async () => {
  try {
    $("#sample_data").DataTable({
      processing: true,
      serverSide: true,
      serverMethod: "get",
      ajax: {
        url: "api/v1/orders/getTableOrder",
      },
      columns: [
        {
          data: "user",
          render: function (data) {
            const n = data ? data.name : null;
            return '<div class= "my-3">' + n + "</div>";
          },
        },
        {
          data: "cart",
          render: function (data) {
            let html = "";
            data.forEach((value, index) => {
              const name =
                value.product.title.length > 39
                  ? value.product.title.slice(0, 40) + "..."
                  : value.product.title;
              html += `<div class= "my-3"> ${name} </div>`;
            });
            return html;
          },
        },
        {
          data: "createdAt",
          render: function (data) {
            const theDate = new Date(Date.parse(data));
            const date = theDate.toLocaleString();
            return '<div class= "my-3">' + date + "</div>";
          },
        },
        {
          data: "status",
          render: function (data) {
            const value = data.length > 9 ? data.slice(0, 8) : data;
            let html = "";
            if (data == "Processed")
              html = `<div class= "my-3"><button class="btn btn-warning" disabled>Chờ xác nhận</button></div>`;
            if (data == "Cancelled")
              html = `<div class= "my-3"><button class="btn btn-danger" disabled>Đã hủy</button></div>`;
            if (data == "WaitingGoods")
              html = `<div class= "my-3"><button class="btn btn-info" disabled>Đợi lấy hàng</button></div>`;
            if (data == "Delivery")
              html = `<div class= "my-3"><button class="btn btn-primary" disabled>Đang vận chuyển</button></div>`;
            if (data == "Success")
              html = `<div class= "my-3"><button class="btn btn-success" disabled>Đã giao hàng</button></div>`;
            return html;
          },
        },
        {
          data: "totalPrice",
          render: function (data) {
            return `<div class= "my-3">${data.toLocaleString('vi-VN')} VND</div>`;
          },
        },
        {
          data: null,
          render: function (row) {
            let btnView = `<a href="/orders/${row.id}"><button type="button" class="btn btn-primary btn-sm mr-1" >Xem chi tiết</button></a>`;

            return `<div class= "my-3">${btnView}</div>`;
          },
        },
      ],
    });

    showAlert("success", "Tải dữ liệu thành công!");
  } catch (err) {
    showAlert("error", err);
  }
};

function reloadData() {
  $("#sample_data").DataTable().ajax.reload();
}
function formatVND(amount) {
  return amount.toLocaleString('vi-VN', { style: 'currency', currency: 'VND' });
}
$(document).ready(function () {
  loadData();
  $(".navbar-nav li").removeClass("active");
  $(".navbar-nav li")[2].className = "nav-item active";
});
