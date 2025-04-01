import React, { useEffect, useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";

const AdminDashboard = () => {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "candidate" });
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const fetchUsers = async () => {
    const res = await axios.get("http://localhost:5000/admin-dashboard", { withCredentials: true });
    setUsers(res.data);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const createUser = async (e) => {
    e.preventDefault();
    setError(""); // clear previous error
  
    try {
      await axios.post("http://localhost:5000/admin-dashboard/create", form, {
        withCredentials: true,
      });
      setForm({ name: "", email: "", password: "", role: "candidate" });
      fetchUsers();
    } catch (err) {
      if (err.response?.status === 409) {
        setError("Email already exists.");
      } else if (err.response?.status === 400) {
        setError("Invalid email format or missing field.");
      } else {
        setError("Server error while creating user.");
        console.error(err); // still log it
      }
    }
  };
  

  const updateUser = async (id, updates) => {
    await axios.post(`http://localhost:5000/admin-dashboard/edit/${id}`, updates, {
      withCredentials: true,
    });
    fetchUsers();
  };

  const deleteUser = async (id) => {
    if (window.confirm("Are you sure?")) {
      await axios.post(`http://localhost:5000/admin-dashboard/delete/${id}`, {}, {
        withCredentials: true,
      });
      fetchUsers();
    }
  };

  // ✅ Handle Logout
  const handleLogout = async () => {
    try {
      const res = await axios.get(
        "http://localhost:5000/auth/logout",
        {},
        { withCredentials: true }
      );

      if (res.status === 200) {
        alert("Logout successful!");
        navigate("/login");
      } else {
        alert("Logout failed. Please try again.");
      }
    } catch (err) {
      console.error("Error during logout:", err);
      alert("Error logging out. Please try again.");
    }
  };


  return (
    <div>
      <h2>Admin Dashboard</h2>
      <h3>Create New User</h3>

      <form onSubmit={createUser}>
        <input name="name" value={form.name} onChange={handleChange} placeholder="Name" required />
        <input name="email" value={form.email} onChange={handleChange} placeholder="Email" required />
        <input name="password" value={form.password} onChange={handleChange} placeholder="Password" required />
        <select name="role" value={form.role} onChange={handleChange}>
          <option value="candidate">Candidate</option>
          <option value="recruiter">Recruiter</option>
          <option value="admin">Admin</option>
        </select>
        <button type="submit">Create</button>
      </form>

      <h3>All Users</h3>
      <table border="1">
        <thead>
          <tr><th>Name</th><th>Email</th><th>Role</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {Array.isArray(users) && users.map((u) => (
            <tr key={u._id}>
              <td>{u.name}</td>
              <td>{u.email}</td>
              <td>{u.role}</td>
              <td>
                <button onClick={() => {
                  const name = prompt("New name:", u.name);
                  const email = prompt("New email:", u.email);
                  const role = prompt("New role (candidate/recruiter/admin):", u.role);
                  updateUser(u._id, { name, email, role });
                }}>Edit</button>

                <button onClick={() => {
                  const newPassword = prompt("New password:");
                  if (newPassword) {
                    axios.post(`http://localhost:5000/admin-dashboard/change-password/${u._id}`, {
                      newPassword
                    }, { withCredentials: true }).then(fetchUsers);
                  }
                }}>Change Password</button>

                <button onClick={() => deleteUser(u._id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ✅ Logout Button */}
      <button onClick={handleLogout}>Logout</button>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
};

export default AdminDashboard;
